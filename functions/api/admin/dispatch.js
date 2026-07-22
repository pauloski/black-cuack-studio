/* POST /api/admin/dispatch   (header x-admin-secret)
   Body: { order: "BQ-XXXX", action: "despachado"|"entregado"|"en_preparacion", tracking? }
   Avanza el estado de despacho (fulfillment) de una orden pagada. En "despachado"
   guarda el N° de seguimiento de Chilexpress (por ahora se pega a mano; con la
   cuenta comercial se generará solo al crear la OT). */

import { json } from '../../_lib/flow.js';
import { requireAdmin } from '../../_lib/admin-auth.js';
import { FULFILLMENT_LABELS, trackingUrl } from '../../_lib/fulfillment.js';

const TTL = 60 * 60 * 24 * 90;

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!env.ORDERS_KV) return json({ error: 'KV no disponible.' }, 503);
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }

  const code = String(body?.order || '').trim().toUpperCase();
  const action = String(body?.action || '');
  if (!/^BQ-[A-Z0-9]{4,}$/.test(code)) return json({ error: 'Número de orden inválido.' }, 400);

  const token = await env.ORDERS_KV.get('ordercode:' + code);
  if (!token) return json({ error: 'No encontramos esa orden.' }, 404);
  const order = await env.ORDERS_KV.get('order:' + token, 'json');
  if (!order) return json({ error: 'No encontramos esa orden.' }, 404);
  if (order.status !== 'paid') return json({ error: 'La orden no está pagada.' }, 409);

  const now = new Date().toISOString();
  if (action === 'despachado') {
    const ot = String(body?.tracking || '').trim();
    if (!ot) return json({ error: 'Falta el número de seguimiento.' }, 400);
    order.fulfillment = 'despachado';
    order.tracking = { ...(order.tracking || {}), ot, dispatched_at: now };
  } else if (action === 'entregado') {
    order.fulfillment = 'entregado';
    order.tracking = { ...(order.tracking || {}), delivered_at: now };
  } else if (action === 'en_preparacion') {
    order.fulfillment = 'en_preparacion';
  } else {
    return json({ error: 'Acción no válida.' }, 400);
  }

  await env.ORDERS_KV.put('order:' + token, JSON.stringify(order), { expirationTtl: TTL });

  return json({
    ok: true,
    order: order.commerceOrder,
    fulfillment: order.fulfillment,
    fulfillmentLabel: FULFILLMENT_LABELS[order.fulfillment] || null,
    tracking: order.tracking ? { ot: order.tracking.ot || null, url: trackingUrl(order.tracking.ot) } : null,
  });
}
