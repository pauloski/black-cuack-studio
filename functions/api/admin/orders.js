/* GET /api/admin/orders   (header x-admin-secret)
   Lista las órdenes PAGADAS para gestionar el despacho desde admin.html. Incluye
   los datos de despacho (dirección, etc.) porque el admin los necesita para armar
   el envío. Recientes primero, tope 100. */

import { json } from '../../_lib/flow.js';
import { requireAdmin } from '../../_lib/admin-auth.js';
import { FULFILLMENT_LABELS, trackingUrl } from '../../_lib/fulfillment.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!env.ORDERS_KV) return json({ error: 'KV no disponible.' }, 503);
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const orders = [];
  let cursor;
  do {
    const page = await env.ORDERS_KV.list({ prefix: 'order:', limit: 1000, cursor });
    for (const k of page.keys) {
      const o = await env.ORDERS_KV.get(k.name, 'json');
      if (!o || o.status !== 'paid') continue; // solo pagadas
      orders.push({
        order: o.commerceOrder,
        created_at: o.created_at || null,
        confirmed_at: o.confirmed_at || null,
        fulfillment: o.fulfillment || null,
        fulfillmentLabel: FULFILLMENT_LABELS[o.fulfillment] || o.fulfillment || null,
        email: o.email || null,
        amount: o.amount != null ? o.amount : null,
        amount_shipping: o.amount_shipping != null ? o.amount_shipping : null,
        courier: o.courier || null,     // 'blue' | 'chilexpress'
        shipping: o.shipping || null,   // nombre, rut, teléfono, dirección/punto, comuna, metodo, ...
        entrega: o.entrega || null,
        tracking: o.tracking ? { ot: o.tracking.ot || null, url: trackingUrl(o.tracking.ot, o.courier) } : null,
        items: (o.lines || []).map((l) => ({ title: l.product_title, variant: l.variant_label || '', qty: l.qty })),
      });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  orders.sort((a, b) => String(b.confirmed_at || b.created_at || '').localeCompare(String(a.confirmed_at || a.created_at || '')));
  return json({ ok: true, orders: orders.slice(0, 100) });
}
