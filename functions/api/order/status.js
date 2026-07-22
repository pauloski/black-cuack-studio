/* GET /api/order/status?order=BQ-XXXX
   Estado PÚBLICO de un pedido para la página de seguimiento del cliente. Devuelve
   solo datos no sensibles (estado, entrega estimada, tracking, ítems) — nunca RUT,
   dirección, teléfono ni email. El número de orden es aleatorio (no enumerable). */

import { json } from '../../_lib/flow.js';
import { publicOrderView } from '../../_lib/fulfillment.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
  if (!env.ORDERS_KV) return json({ ok: false, error: 'Seguimiento no disponible.' }, 503);

  const code = (new URL(request.url).searchParams.get('order') || '').trim().toUpperCase();
  if (!/^BQ-[A-Z0-9]{4,}$/.test(code)) return json({ ok: false, error: 'Número de orden inválido.' }, 400);

  // ordercode:<commerceOrder> → token de Flow (índice escrito en el checkout).
  const token = await env.ORDERS_KV.get('ordercode:' + code);
  if (!token) return json({ ok: false, error: 'No encontramos esa orden.' }, 404);

  const order = await env.ORDERS_KV.get('order:' + token, 'json');
  if (!order) return json({ ok: false, error: 'No encontramos esa orden.' }, 404);

  return json({ ok: true, ...publicOrderView(order) });
}
