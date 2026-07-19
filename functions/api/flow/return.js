/* POST /api/flow/return — aterrizaje del navegador tras pagar.

   OJO: Flow devuelve al cliente con un POST (form del navegador), no un GET.
   Por eso este endpoint es una Function y no gracias.html: un asset estático de
   Pages no responde POST y el cliente vería un 405 justo después de pagar.

   Esto es solo presentación. El pedido se da por válido en /api/flow/confirm,
   que corre aunque el cliente nunca vuelva. */

import { flowGet, FLOW_STATUS } from '../../_lib/flow.js';

const PAGE = '/gracias.html';

/* 303 fuerza que el navegador cambie el POST por un GET al seguir el redirect. */
const seeOther = (location) => new Response(null, { status: 303, headers: { Location: location } });

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST' && request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let token = '';
  try {
    if (request.method === 'POST') {
      const form = await request.formData();
      token = String(form.get('token') || '');
    } else {
      token = new URL(request.url).searchParams.get('token') || '';
    }
  } catch {
    /* cae a estado desconocido */
  }

  if (!token) return seeOther(PAGE + '?status=unknown');

  let payment;
  try {
    payment = await flowGet(env, '/payment/getStatus', { token });
  } catch (e) {
    console.error('[flow/return] getStatus falló:', e.message);
    return seeOther(PAGE + '?status=unknown');
  }

  const status = Number(payment?.status);
  const label =
    status === FLOW_STATUS.PAID ? 'paid'
      : status === FLOW_STATUS.REJECTED ? 'rejected'
        : status === FLOW_STATUS.CANCELED ? 'canceled'
          : 'pending';

  const order = encodeURIComponent(payment?.commerceOrder || '');
  return seeOther(PAGE + '?status=' + label + '&order=' + order);
}
