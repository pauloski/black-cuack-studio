/* Middleware SEO — inyecta Open Graph / Twitter / canonical / breadcrumb EN EL
   SERVIDOR para la página de producto.

   Por qué en el servidor: la PDP se arma client-side, pero los scrapers sociales
   (WhatsApp, Facebook, Twitter) NO ejecutan JS. Sin esto, al compartir el link del
   producto la preview sale pelada. Aquí, con HTMLRewriter, insertamos la meta en el
   <head> leyendo el catálogo cacheado, antes de servir el HTML.

   DEFENSIVO: solo transforma /producto(.html) con ?id y HTML; ante cualquier duda o
   error, devuelve la respuesta original intacta → nunca rompe el sitio ni /api. */

import { getCatalog } from './_lib/catalog.js';
import { BRAND } from './_lib/brand.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function onRequest(context) {
  const { request, env, next } = context;
  const response = await next();
  try {
    const url = new URL(request.url);
    if (url.pathname !== '/producto' && url.pathname !== '/producto.html') return response;
    const id = url.searchParams.get('id');
    if (!id) return response;
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return response;

    const catalog = await getCatalog(env);
    const p = catalog.get(id);
    if (!p) return response;

    const origin = url.origin;
    const canonical = origin + '/producto.html?id=' + encodeURIComponent(p.id);
    const title = (p.product_title || 'Producto') + ' — ' + BRAND.name;
    const desc = (p.description || p.product_title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const prices = p.variants && p.variants.length ? p.variants.map((v) => v.price) : [p.price];
    const price = Math.max(0, Math.min(...prices));
    const img = p.image_url ? p.image_url + (p.image_url.indexOf('?') === -1 ? '?' : '&') + 'fm=jpg&w=1200' : '';

    const breadcrumb = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: origin + '/' },
        { '@type': 'ListItem', position: 2, name: 'Tienda', item: origin + '/tienda.html' },
        { '@type': 'ListItem', position: 3, name: p.product_title || 'Producto' }
      ]
    };
    const ld = JSON.stringify(breadcrumb).replace(/</g, '\\u003c');

    const tags =
      '<meta property="og:type" content="product">' +
      '<meta property="og:site_name" content="' + esc(BRAND.name) + '">' +
      '<meta property="og:title" content="' + esc(title) + '">' +
      '<meta property="og:description" content="' + esc(desc) + '">' +
      '<meta property="og:url" content="' + esc(canonical) + '">' +
      (img ? '<meta property="og:image" content="' + esc(img) + '">' : '') +
      '<meta property="product:price:amount" content="' + price + '">' +
      '<meta property="product:price:currency" content="CLP">' +
      '<meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + esc(title) + '">' +
      '<meta name="twitter:description" content="' + esc(desc) + '">' +
      (img ? '<meta name="twitter:image" content="' + esc(img) + '">' : '') +
      '<link rel="canonical" href="' + esc(canonical) + '">' +
      '<script type="application/ld+json">' + ld + '</script>';

    return new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(title); } })
      .on('meta[name="description"]', { element(el) { if (desc) el.setAttribute('content', desc); } })
      .on('head', { element(el) { el.append(tags, { html: true }); } })
      .transform(response);
  } catch (e) {
    console.error('[seo-mw]', e && e.message);
    return response; // pase lo que pase, no rompemos la página
  }
}
