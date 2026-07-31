/* GET /api/catalog
   Proxy del catálogo de Contentful (CDA) CACHEADO EN EL EDGE, para el storefront.

   Por qué existe: el frontend leía Contentful directo en cada carga de página
   (`cache: 'no-store'` en js/api.js), gastando 1 llamada CDA por visita. Con
   publicidad, ese patrón escala 1:1 con el tráfico y se come el cupo Free de
   100K llamadas/mes de Contentful. Esta Function lo sirve desde el edge de
   Cloudflare: `cf.cacheEverything` cachea la subrequest, así mil visitas se
   traducen en ~1 llamada a Contentful por minuto por ubicación del edge.

   Devuelve el JSON CRUDO de la CDA (items + includes.Asset + includes.Entry) tal
   cual, para que js/api.js siga haciendo su mapeo (imágenes WebP, variantes, rich
   text) SIN cambios. La respuesta de la CDA no incluye el token, así que es seguro
   reenviarla. */

const CDN = 'https://cdn.contentful.com';
const TTL = 60; // s. El catálogo no cambia por segundo; subir si se quiere menos frescura.

function err(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return err('Método no permitido.', 405);

  const space = env.CONTENTFUL_SPACE_ID;
  const token = env.CONTENTFUL_ACCESS_TOKEN;
  const environment = env.CONTENTFUL_ENVIRONMENT || 'master';
  const contentType = env.CONTENTFUL_CONTENT_TYPE || 'product';

  if (!space || !token) {
    console.error('[catalog] faltan CONTENTFUL_SPACE_ID / CONTENTFUL_ACCESS_TOKEN.');
    return err('Catálogo no disponible.', 503);
  }

  // Mismos parámetros que pedía js/api.js: include=2 resuelve variants y assets.
  const url =
    CDN + '/spaces/' + space + '/environments/' + environment +
    '/entries?access_token=' + encodeURIComponent(token) +
    '&content_type=' + encodeURIComponent(contentType) +
    '&include=2&limit=100&order=fields.id';

  try {
    // cacheEverything + cacheTtl: Cloudflare cachea esta subrequest en el edge.
    // El runtime de Workers ignora el campo `cache` de fetch; la frescura se
    // controla con cf.cacheTtl. (Mismo patrón que functions/_lib/catalog.js.)
    const res = await fetch(url, { cf: { cacheTtl: TTL, cacheEverything: true } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[catalog] Contentful ' + res.status + ': ' + detail.slice(0, 200));
      return err('No pudimos leer el catálogo.', 502);
    }
    const body = await res.text(); // reenvía el JSON crudo, sin re-parsear
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // El navegador y el CDN de Cloudflare también cachean la respuesta.
        'Cache-Control': 'public, max-age=' + TTL + ', s-maxage=' + TTL,
      },
    });
  } catch (e) {
    console.error('[catalog]', e.message);
    return err('Error consultando el catálogo.', 500);
  }
}
