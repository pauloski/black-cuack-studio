/* GET /api/catalog
   Proxy del catálogo de Contentful (CDA) CACHEADO EN EL EDGE, para el storefront.

   Por qué existe: el frontend leía Contentful directo en cada carga de página
   (`cache: 'no-store'` en js/api.js), gastando 1 llamada CDA por visita. Con
   publicidad, ese patrón escala 1:1 con el tráfico y se come el cupo Free de
   100K llamadas/mes de Contentful. Esta Function lo sirve desde el edge de
   Cloudflare, colapsando N visitas en ~1 llamada a Contentful por minuto por
   ubicación del edge.

   Dos capas de caché:
     1. Cache API (`caches.default`): cacheamos NUESTRA respuesta en el edge. En un
        HIT la Function retorna sin siquiera llamar a Contentful. Observable por el
        header `x-bq-cache: HIT|MISS`.
     2. `cf.cacheEverything` sobre la subrequest a Contentful: segunda red por si la
        Cache API está fría en ese colo.

   Devuelve el JSON CRUDO de la CDA (items + includes.Asset + includes.Entry) tal
   cual, para que js/api.js siga haciendo su mapeo (imágenes WebP, variantes, rich
   text) SIN cambios. La respuesta de la CDA no incluye el token → seguro reenviarla. */

const CDN = 'https://cdn.contentful.com';
const TTL = 60; // s. El catálogo no cambia por segundo; subir si se quiere menos frescura.

function err(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  if (request.method !== 'GET') return err('Método no permitido.', 405);

  // Clave de caché normalizada: misma para todos los visitantes (ignora su query/headers).
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/catalog', request.url).toString(), { method: 'GET' });

  // Capa 1: ¿ya está en el edge? Si sí, no tocamos Contentful.
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set('x-bq-cache', 'HIT');
    return hit;
  }

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
    // Capa 2: cacheEverything cachea también la subrequest en el edge.
    const res = await fetch(url, { cf: { cacheTtl: TTL, cacheEverything: true } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[catalog] Contentful ' + res.status + ': ' + detail.slice(0, 200));
      return err('No pudimos leer el catálogo.', 502);
    }
    const body = await res.text(); // reenvía el JSON crudo, sin re-parsear
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // s-maxage controla el TTL en la Cache API y en downstream; max-age, el navegador.
        'Cache-Control': 'public, max-age=' + TTL + ', s-maxage=' + TTL,
        'x-bq-cache': 'MISS',
      },
    });
    // Guarda en el edge sin bloquear la respuesta al visitante.
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    console.error('[catalog]', e.message);
    return err('Error consultando el catálogo.', 500);
  }
}
