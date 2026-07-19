/* POST /api/flow/confirm — webhook servidor-a-servidor de Flow.

   Flow manda solo { token } form-urlencoded y espera HTTP 200 en <15s.
   El token NO es prueba de pago: hay que consultar payment/getStatus y confiar
   únicamente en esa respuesta firmada. Esta es la fuente de verdad del pedido,
   no el urlReturn (el cliente puede cerrar el navegador antes de volver). */

import { flowGet, FLOW_STATUS } from '../../_lib/flow.js';
import { commitCart, releaseCart } from '../../_lib/stock.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  /* Sin KV no podemos anotar que el pago se acreditó. Devolvemos 500 para que
     Flow reintente en vez de dar la confirmación por entregada y perderla. */
  if (!env.ORDERS_KV) {
    console.error('[flow/confirm] CRÍTICO: falta el binding KV "ORDERS_KV". Pago sin registrar.');
    return new Response('Retry', { status: 500 });
  }

  let token;
  try {
    const form = await request.formData();
    token = String(form.get('token') || '');
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (!token) return new Response('Bad Request', { status: 400 });

  let payment;
  try {
    payment = await flowGet(env, '/payment/getStatus', { token });
  } catch (e) {
    /* 500 hace que Flow reintente la confirmación. Es lo correcto ante un fallo
       transitorio: preferimos el reintento a dar por cerrada una orden a ciegas. */
    console.error('[flow/confirm] getStatus falló:', e.message);
    return new Response('Retry', { status: 500 });
  }

  const status = Number(payment?.status);
  const paid = status === FLOW_STATUS.PAID;
  const finalRejected = status === FLOW_STATUS.REJECTED || status === FLOW_STATUS.CANCELED;

  const record = env.ORDERS_KV ? await env.ORDERS_KV.get('order:' + token, 'json') : null;

  /* Defensa contra un monto adulterado: comparamos lo que Flow dice que se pagó
     contra lo que calculamos al crear la orden. */
  if (paid && record && Number(payment.amount) !== Number(record.amount)) {
    console.error(
      '[flow/confirm] DESCUADRE de monto en', record.commerceOrder,
      '· esperado', record.amount, '· Flow reporta', payment.amount
    );
  }

  /* Resolución del stock reservado, idempotente vía stock_state. La reserva ya
     descontó al crear la orden; acá solo la consumamos (pago ok) o la liberamos
     (rechazo). El guard evita doblar si Flow reintenta el webhook. */
  let stockState = record?.stock_state || null;
  if (record?.lines && env.ORDERS_DB && stockState === 'reserved') {
    try {
      if (paid) {
        await commitCart(env.ORDERS_DB, record.lines, record.commerceOrder);
        stockState = 'committed';
      } else if (finalRejected) {
        await releaseCart(env.ORDERS_DB, record.lines, record.commerceOrder);
        stockState = 'released';
      }
    } catch (e) {
      // Si falla, dejamos 'reserved' y pedimos reintento: Flow reintentará el webhook.
      console.error('[flow/confirm] stock', record.commerceOrder, e.message);
      return new Response('Retry', { status: 500 });
    }
  }

  if (env.ORDERS_KV) {
    await env.ORDERS_KV.put(
      'order:' + token,
      JSON.stringify({
        ...(record || {}),
        status: paid ? 'paid' : status === FLOW_STATUS.REJECTED ? 'rejected'
          : status === FLOW_STATUS.CANCELED ? 'canceled' : 'pending',
        flow_status: status,
        flow_amount: payment?.amount ?? null,
        commerceOrder: payment?.commerceOrder ?? record?.commerceOrder ?? null,
        flowOrder: payment?.flowOrder ?? record?.flowOrder ?? null,
        payer: payment?.payer ?? null,
        stock_state: stockState,
        confirmed_at: new Date().toISOString()
      }),
      { expirationTtl: 60 * 60 * 24 * 90 }
    );
  }

  console.log('[flow/confirm]', payment?.commerceOrder, 'status', status, paid ? '→ PAGADA' : '');

  // 200 siempre que hayamos procesado: si no, Flow reintenta indefinidamente.
  return new Response('OK', { status: 200 });
}
