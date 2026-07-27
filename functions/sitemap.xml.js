/* GET /sitemap.xml — sitemap dinámico generado desde Contentful.

   Lista las páginas públicas indexables + una URL por producto publicado. Se
   regenera solo: al agregar/quitar un producto en Contentful, el sitemap cambia
   sin tocar código. Cacheado 1 h en el edge (no necesita ser en tiempo real).

   El archivo se llama sitemap.xml.js a propósito: en el enrutado de Pages
   Functions, el nombre (sin el .js final) es la ruta → responde /sitemap.xml. */

import { getCatalog } from './_lib/catalog.js';

// Páginas públicas indexables. Se excluyen a propósito checkout, admin, gracias y
// seguimiento (transaccionales / noindex).
const STATIC_PATHS = ['/', '/tienda.html', '/nosotros.html', '/contacto.html', '/labs.html', '/talleres.html'];

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export async function onRequest(context) {
  const { request, env } = context;
  // Origen tomado del request → fork-friendly (funciona en cualquier dominio/Preview).
  const origin = new URL(request.url).origin;

  let productPaths = [];
  try {
    const catalog = await getCatalog(env); // Map(id → producto)
    productPaths = [...catalog.values()]
      .filter((p) => p && p.id)
      .map((p) => '/producto.html?id=' + encodeURIComponent(p.id));
  } catch (e) {
    // Si Contentful falla, servimos al menos las páginas estáticas (no rompemos).
    console.error('[sitemap] getCatalog falló:', e.message);
  }

  const urls = STATIC_PATHS.concat(productPaths)
    .map((p) => '  <url><loc>' + escapeXml(origin + p) + '</loc></url>')
    .join('\n');

  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls + '\n</urlset>\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
