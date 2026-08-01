/* GET /feed.xml — feed de productos para Google Merchant Center / Meta Commerce.

   Mismo patrón que sitemap.xml.js: lee el catálogo de Contentful (cacheado) y lo
   emite en RSS 2.0 con namespace g: que consumen Google Shopping y el catálogo de
   Instagram/Facebook. El comercio pega esta URL en Merchant Center / Commerce
   Manager y se sincroniza solo. Cacheado 1 h en el edge → costo cero.

   Nombre feed.xml.js: en el enrutado de Pages Functions, el nombre (sin .js) es la
   ruta → responde /feed.xml. */

import { getCatalog } from './_lib/catalog.js';
import { BRAND } from './_lib/brand.js';

function xmlEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;

  let products = [];
  try {
    const catalog = await getCatalog(env);
    products = [...catalog.values()].filter((p) => p && p.id && p.image_url);
  } catch (e) {
    console.error('[feed] getCatalog falló:', e.message);
  }

  // Stock vivo (D1) para la disponibilidad, en UNA sola consulta. Si falla, todo va
  // como disponible (Google re-lee el feed periódicamente; no es tiempo real).
  const stockTotals = {};
  if (env.ORDERS_DB) {
    try {
      const { results } = await env.ORDERS_DB
        .prepare('SELECT product_id, SUM(qty) AS total FROM stock GROUP BY product_id')
        .all();
      for (const r of results || []) stockTotals[r.product_id] = Number(r.total) || 0;
    } catch (e) {
      console.error('[feed] stock D1 falló:', e.message);
    }
  }

  const items = products.map((p) => {
    const prices = p.variants && p.variants.length ? p.variants.map((v) => v.price) : [p.price];
    const price = Math.max(0, Math.min(...prices));
    const total = stockTotals[p.id];
    const avail = total == null ? 'in_stock' : (total > 0 ? 'in_stock' : 'out_of_stock');
    const desc = (p.description || p.product_title || '').slice(0, 4000);
    const img = p.image_url + (p.image_url.indexOf('?') === -1 ? '?' : '&') + 'fm=jpg&w=1200&q=85';
    return [
      '  <item>',
      '    <g:id>' + xmlEscape(p.id) + '</g:id>',
      '    <g:title>' + xmlEscape(p.product_title) + '</g:title>',
      '    <g:description>' + xmlEscape(desc) + '</g:description>',
      '    <g:link>' + xmlEscape(origin + '/producto.html?id=' + encodeURIComponent(p.id)) + '</g:link>',
      '    <g:image_link>' + xmlEscape(img) + '</g:image_link>',
      '    <g:availability>' + avail + '</g:availability>',
      '    <g:price>' + price + ' CLP</g:price>',
      '    <g:brand>' + xmlEscape(BRAND.name) + '</g:brand>',
      '    <g:condition>new</g:condition>',
      '    <g:identifier_exists>no</g:identifier_exists>',
      '  </item>'
    ].join('\n');
  }).join('\n');

  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
    '<channel>\n' +
    '  <title>' + xmlEscape(BRAND.name) + '</title>\n' +
    '  <link>' + xmlEscape(origin) + '</link>\n' +
    '  <description>Catálogo de productos de ' + xmlEscape(BRAND.name) + '</description>\n' +
    items + '\n' +
    '</channel>\n</rss>\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
