/* GET /api/stock?product=BQ-002
   → { "product":"BQ-002",
       "variants":[ {"key":"size:s","size":"S","color":"","design":"","qty":10}, ... ],
       "simple": false }

   Estrategia híbrida:
   - Lee las variantes REALES desde Contentful (catálogo administrable).
   - Cruza con D1 para el stock en vivo.
   - Lazy-seed: si un SKU de Contentful aún no está en D1 (producto recién
     publicado), usa el stock inicial de Contentful, lo inserta y sigue. */

import { getCatalog, seedUnits } from '../_lib/catalog.js';
import { lazySeed, stockForProduct, variantKey } from '../_lib/stock.js';
import { json } from '../_lib/flow.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
  if (!env.ORDERS_DB) {
    console.error('[stock] falta el binding D1 "ORDERS_DB".');
    return json({ error: 'Stock no disponible.' }, 503);
  }

  const productId = new URL(request.url).searchParams.get('product');
  if (!productId) return json({ error: 'Falta el parámetro product.' }, 400);

  try {
    const catalog = await getCatalog(env);
    const product = catalog.get(productId);
    if (!product) return json({ error: 'Producto no encontrado.' }, 404);

    // Siembra idempotente: solo inserta SKU nuevos, respeta lo que ya vive en D1.
    await lazySeed(env.ORDERS_DB, productId, seedUnits(product));

    const live = await stockForProduct(env.ORDERS_DB, productId);
    const simple = product.variants.length === 0;

    const variants = simple
      ? [{ key: '', size: '', color: '', design: '', qty: live[''] != null ? live[''] : 0 }]
      : product.variants.map((v) => ({
          key: v.key, size: v.size, color: v.color, design: v.design,
          qty: live[v.key] != null ? live[v.key] : 0
        }));

    return new Response(JSON.stringify({ product: productId, simple, variants }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=15'
      }
    });
  } catch (e) {
    console.error('[stock]', e.message);
    return json({ error: 'Error consultando stock.' }, 500);
  }
}
