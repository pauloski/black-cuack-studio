/* GET /api/admin/stock[?product=BQ-002]
   Header  x-admin-secret: <secreto>

   Visor de inventario en vivo (D1) para el admin. Por cada SKU devuelve el stock
   `vivo` (D1, la verdad) y el `inicial` de Contentful, para ver el desfase.

   Al cargar hace lazy-seed de todos los SKU: así las variantes nuevas quedan
   materializadas en D1 y cualquier ajuste posterior (stock-adjust) pega en una
   fila existente. Es idempotente (INSERT OR IGNORE) y no toca lo ya sembrado. */

import { getCatalog, seedUnits } from '../../_lib/catalog.js';
import { lazySeed, stockForProduct, variantKey } from '../../_lib/stock.js';
import { json } from '../../_lib/flow.js';
import { requireAdmin } from '../../_lib/admin-auth.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
  if (!env.ORDERS_DB) return json({ error: 'D1 no disponible.' }, 503);

  const denied = requireAdmin(request, env);
  if (denied) return denied;

  let catalog;
  try {
    catalog = await getCatalog(env);
  } catch (e) {
    console.error('[admin/stock] catálogo:', e.message);
    return json({ error: 'No pudimos leer Contentful.' }, 502);
  }

  const only = new URL(request.url).searchParams.get('product');
  const products = [];

  for (const [id, product] of catalog) {
    if (only && id !== only) continue;
    const units = seedUnits(product);
    try {
      await lazySeed(env.ORDERS_DB, id, units); // materializa SKU nuevos (idempotente)
    } catch (e) {
      console.error('[admin/stock] seed', id, e.message);
    }
    const live = await stockForProduct(env.ORDERS_DB, id);
    const skus = units.map((u) => {
      const key = variantKey(u);
      return {
        variantKey: key,
        label: [u.size, u.color, u.design].filter(Boolean).join(' · '),
        inicial: u.initialStock != null ? Number(u.initialStock) : 0,
        vivo: live[key] != null ? live[key] : 0,
      };
    });
    products.push({ product: id, title: product.product_title, skus });
  }

  return json({ ok: true, products });
}
