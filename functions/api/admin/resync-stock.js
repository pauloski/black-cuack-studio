/* POST|GET /api/admin/resync-stock[?product=BQ-002]
   Header  x-admin-secret: <secreto>   ó   ?secret=<secreto>

   Reabastecimiento autoritativo: lee Contentful EN VIVO (sin caché) y machaca
   el qty de D1 con el stock que el admin acaba de publicar. Registra 'restock'
   en la bitácora.

   ADVERTENCIA: destructivo respecto a reservas en vuelo (órdenes 'reserved' sin
   pagar). Correr cuando no haya pagos a medio camino, justo tras reponer.

   Seguridad (sprint): un secreto simple. GET expone el secreto en el historial
   y en logs; para uso repetido, preferir el POST con header desde admin.html. */

import { getCatalog, seedUnits } from '../../_lib/catalog.js';
import { resyncStock } from '../../_lib/stock.js';
import { json } from '../../_lib/flow.js';

/* Comparación de tiempo constante (evita filtrar el secreto por timing). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return json({ error: 'Método no permitido.' }, 405);
  }
  if (!env.ORDERS_DB) return json({ error: 'D1 no disponible.' }, 503);
  if (!env.ADMIN_RESYNC_SECRET) {
    console.error('[resync] falta ADMIN_RESYNC_SECRET en el entorno.');
    return json({ error: 'Resync no configurado.' }, 503);
  }

  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-secret') || url.searchParams.get('secret') || '';
  if (!safeEqual(provided, env.ADMIN_RESYNC_SECRET)) {
    return json({ error: 'No autorizado.' }, 401);
  }

  let catalog;
  try {
    catalog = await getCatalog(env, { fresh: true }); // EN VIVO, sin caché
  } catch (e) {
    console.error('[resync] catálogo:', e.message);
    return json({ error: 'No pudimos leer Contentful.' }, 502);
  }

  // Opcional: limitar a un producto (?product=BQ-002); por defecto, todos.
  const only = url.searchParams.get('product');
  const summary = [];
  for (const [id, product] of catalog) {
    if (only && id !== only) continue;
    try {
      const changes = await resyncStock(env.ORDERS_DB, id, seedUnits(product));
      summary.push({ product: id, title: product.product_title, changes });
    } catch (e) {
      console.error('[resync]', id, e.message);
      summary.push({ product: id, error: e.message });
    }
  }

  const skus = summary.reduce((a, s) => a + (s.changes ? s.changes.length : 0), 0);
  console.log('[resync] OK ·', summary.length, 'productos ·', skus, 'SKUs actualizados');
  return json({
    ok: true,
    products: summary.length,
    skus,
    warning: 'El resync machaca qty con el stock de Contentful. Evita correrlo con pagos en vuelo.',
    summary
  });
}
