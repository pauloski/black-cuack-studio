/* POST /api/checkout
   Body: { "email": "...", "items": [{ "id": "BQ-001", "qty": 2 }], "shipping": {...} }
   Respuesta: { "redirect": "https://www.flow.cl/app/web/pay.php?token=..." }

   El browser manda SOLO id + qty. El monto se calcula acá contra Contentful. */

import { flowPost, json } from '../_lib/flow.js';
import { getCatalog, priceCart, buildSubject, seedUnits } from '../_lib/catalog.js';
import { validateShipping } from '../_lib/shipping.js';
import { reserveCart, releaseCart, lazySeed } from '../_lib/stock.js';
import { computeShipping, FALLBACK_SHIPPING } from '../_lib/shipping-quote.js';
import { estimateDelivery } from '../_lib/delivery-estimate.js';
import { bluePickupRate } from '../_lib/blue-rates.js';
import { methodById, isMethodEnabled } from '../_lib/shipping-methods.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Ventana de pago de Flow en segundos (1h). El sweeper libera reservas pasadas esto.
const RESERVATION_WINDOW_SECONDS = 3600;

function orderId() {
  // Único e impredecible: commerceOrder no se puede repetir entre intentos.
  return 'BQ-' + crypto.randomUUID().split('-')[0].toUpperCase();
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405);
  }

  /* Se comprueba ANTES de crear el pago en Flow. Sin KV no hay dónde anotar el
     pedido, y cobrar sin registro deja al cliente pagado y sin despacho: es
     preferible no vender. Falla ruidosamente en vez de degradar en silencio. */
  if (!env.ORDERS_KV || !env.ORDERS_DB) {
    console.error('[checkout] CRÍTICO: falta binding ORDERS_KV o ORDERS_DB. No se cobra nada.');
    return json({ error: 'El checkout no está disponible en este momento. Escríbenos y lo resolvemos.' }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const email = String(payload?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return json({ error: 'Necesitamos un email válido.', fields: { email: 'Email inválido.' } }, 400);
  }

  /* Método de despacho (según el flag del ambiente). */
  const methodId = String(payload?.method || 'blue_retiro');
  const method = methodById(methodId);
  if (!method || !isMethodEnabled(env, methodId)) {
    return json({ error: 'Método de despacho no disponible.' }, 400);
  }

  /* Sin datos de despacho válidos no se cobra. Domicilio exige dirección; retiro
     en Punto Blue exige el punto. */
  const ship = validateShipping(payload?.shipping, {
    requireDireccion: !!method.needsDireccion,
    requirePunto: !!method.needsPunto,
  });
  if (!ship.ok) {
    return json({ error: 'Revisa los datos de despacho.', fields: ship.errors }, 400);
  }

  let catalog;
  try {
    catalog = await getCatalog(env);
  } catch (e) {
    console.error('[checkout] catálogo:', e.message);
    return json({ error: 'No pudimos validar el catálogo. Intenta en unos segundos.' }, 502);
  }

  const priced = priceCart(payload?.items, catalog);
  if (priced.error) return json({ error: priced.error }, 400);

  const commerceOrder = orderId();
  const origin = new URL(request.url).origin;

  /* Lazy-seed de cada producto del carrito antes de reservar: si es un producto
     recién publicado y aún no está en D1, se siembra desde el stock de Contentful. */
  try {
    for (const id of new Set(priced.lines.map((l) => l.id))) {
      const p = catalog.get(id);
      if (p) await lazySeed(env.ORDERS_DB, id, seedUnits(p));
    }
  } catch (e) {
    console.error('[checkout] lazy-seed:', e.message);
    return json({ error: 'No pudimos validar el inventario. Intenta nuevamente.' }, 502);
  }

  /* RESERVA ATÓMICA antes de tocar Flow. Si no hay stock, no se crea el pago.
     Esto es lo que impide vender dos veces la última unidad bajo concurrencia. */
  let reserved;
  try {
    reserved = await reserveCart(env.ORDERS_DB, priced.lines, commerceOrder);
  } catch (e) {
    console.error('[checkout] reserva:', e.message);
    return json({ error: 'No pudimos reservar el stock. Intenta nuevamente.' }, 502);
  }
  if (!reserved.ok) {
    const line = priced.lines.find((l) => l.id === reserved.failed.id && l.key === reserved.failed.key);
    const name = line ? line.product_title + (line.variant_label ? ' (' + line.variant_label + ')' : '') : 'un producto';
    return json({ error: 'Se agotó el stock de ' + name + ' mientras comprabas.', soldOut: reserved.failed }, 409);
  }

  /* Cotiza el envío A DOMICILIO con Chilexpress SERVER-SIDE: el costo que muestre
     el navegador nunca se confía (mismo principio que el precio de los productos).
     - Sin cobertura → no se cobra: se libera la reserva y se avisa.
     - Chilexpress caído → tarifa de respaldo para no perder la venta (se registra). */
  let shipCost, shipService;
  if (method.courier === 'blue') {
    // Retiro en Punto Blue: precio de TABLA (Blue no tiene API).
    const r = bluePickupRate(ship.shipping.comuna);
    if (!r.ok) {
      await releaseCart(env.ORDERS_DB, priced.lines, commerceOrder).catch(() => {});
      return json({ error: r.error, fields: { comuna: r.error } }, 409);
    }
    shipCost = r.costo;
    shipService = 'Punto Blue';
  } else {
    // Domicilio Chilexpress: cotización en vivo, con tarifa de respaldo si falla.
    try {
      const s = await computeShipping(env, catalog, ship.shipping.comuna, priced.lines, priced.amount);
      if (!s.ok && s.noCoverage) {
        await releaseCart(env.ORDERS_DB, priced.lines, commerceOrder).catch(() => {});
        return json({ error: s.error, fields: { comuna: 'Chilexpress no despacha a esta comuna.' } }, 409);
      }
      if (!s.ok) {
        console.warn('[checkout] cotización de envío falló, usando respaldo:', s.error, JSON.stringify(s.errors || ''));
        shipCost = FALLBACK_SHIPPING; shipService = 'Chilexpress';
      } else {
        shipCost = s.costo; shipService = s.servicio;
      }
    } catch (e) {
      console.warn('[checkout] cotización de envío con excepción, usando respaldo:', e.message);
      shipCost = FALLBACK_SHIPPING; shipService = 'Chilexpress';
    }
  }

  const amountProducts = priced.amount;
  const amountTotal = amountProducts + shipCost;

  /* Flow cobra el total = productos + envío a domicilio (Chilexpress). */
  const params = {
    commerceOrder,
    subject: buildSubject(priced.lines),
    currency: 'CLP',
    amount: amountTotal,
    email,
    /* Ventana de pago: pasado esto, Flow no cobra la orden. Hace determinista el
       abandono para el sweeper, que libera la reserva pasada esta ventana. */
    timeout: RESERVATION_WINDOW_SECONDS,
    urlConfirmation: origin + '/api/flow/confirm',
    urlReturn: origin + '/api/flow/return',
    /* A Flow le mandamos lo mínimo para conciliar. El RUT, la dirección y el
       teléfono son datos personales que no necesita la pasarela para cobrar:
       quedan en nuestro KV, asociados al commerceOrder. */
    optional: JSON.stringify({
      items: priced.lines.map((l) => l.id + 'x' + l.qty).join(','),
      envio: (method.courier === 'blue' ? 'Retiro Punto Blue' : 'Domicilio Chilexpress') + ' · ' + shipService + ' $' + shipCost,
      comuna: ship.shipping.comuna
    })
  };

  let created;
  try {
    created = await flowPost(env, '/payment/create', params);
  } catch (e) {
    console.error('[checkout] flow create:', e.message);
    // El pago no se creó: liberamos la reserva para no dejar stock retenido.
    await releaseCart(env.ORDERS_DB, priced.lines, commerceOrder).catch(() => {});
    return json({ error: 'No pudimos iniciar el pago. Intenta nuevamente.' }, 502);
  }

  if (!created?.url || !created?.token) {
    console.error('[checkout] respuesta Flow inesperada:', JSON.stringify(created));
    await releaseCart(env.ORDERS_DB, priced.lines, commerceOrder).catch(() => {});
    return json({ error: 'Respuesta inválida de Flow.' }, 502);
  }

  /* Registrar la orden es parte del cobro, no un extra: si esto falla, el cliente
     pagó y no sabemos qué despacharle. Como el pago ya está creado en Flow, un
     fallo acá se registra como crítico para poder reconciliar a mano. */
  try {
    await env.ORDERS_KV.put(
      'order:' + created.token,
      JSON.stringify({
        commerceOrder,
        flowOrder: created.flowOrder ?? null,
        email,
        // Desglose: productos + envío = total cobrado por Flow.
        amount: amountTotal,
        amount_products: amountProducts,
        amount_shipping: shipCost,
        lines: priced.lines,
        // Courier normalizado (para tracking) y datos de despacho.
        courier: method.courier,   // 'blue' | 'chilexpress'
        shipping: {
          ...ship.shipping,        // incluye punto (retiro) o direccion (domicilio)
          courier: method.courier === 'blue' ? 'Blue Express' : 'Chilexpress',
          metodo: method.metodo,   // retiro_punto | domicilio
          modalidad: method.label,
          costo: shipCost, servicio: shipService,
        },
        // Ventana de entrega estimada al momento de la compra (preparación + tránsito).
        entrega: estimateDelivery(ship.shipping.comuna),
        // Estado de despacho (separado del de pago). Etapa B: confirm lo pasa a
        // 'en_preparacion' al aprobarse el pago, y el admin a 'despachado'.
        fulfillment: 'pendiente_pago',
        status: 'pending',
        // 'reserved' → el stock ya se descontó. confirm lo pasa a committed/released.
        stock_state: 'reserved',
        created_at: new Date().toISOString()
      }),
      { expirationTtl: 60 * 60 * 24 * 90 }
    );
    // Índice commerceOrder → token, para la página de seguimiento del cliente.
    // Best-effort: si falla, la orden igual quedó guardada (solo no se puede
    // buscar por número hasta reindexar).
    await env.ORDERS_KV.put('ordercode:' + commerceOrder, created.token, { expirationTtl: 60 * 60 * 24 * 90 }).catch(() => {});
  } catch (e) {
    console.error(
      '[checkout] CRÍTICO: no se pudo guardar la orden', commerceOrder,
      '· token', created.token, '· monto', priced.amount, '·', e.message,
      '· datos:', JSON.stringify({ email, shipping: ship.shipping, lines: priced.lines })
    );
    await releaseCart(env.ORDERS_DB, priced.lines, commerceOrder).catch(() => {});
    return json({ error: 'No pudimos registrar tu pedido. No se te ha cobrado nada, intenta nuevamente.' }, 500);
  }

  // Flow indica redirigir a: url + "?token=" + token
  return json({ redirect: created.url + '?token=' + created.token, commerceOrder });
}
