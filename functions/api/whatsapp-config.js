/* GET /api/whatsapp-config
   Proxy de la config del widget de WhatsApp (Contentful CDA) CACHEADO EN EL EDGE.

   Por qué existe: js/whatsapp.js leía Contentful directo. Su caché en sessionStorage
   evita repetir el request DURANTE la navegación, pero un VISITANTE NUEVO (caché
   vacía) siempre disparaba 1 llamada CDA. Con publicidad eso escala ~1 por visitante
   único y era, junto con la banda de imágenes, uno de los dos techos del plan Free
   de Contentful (100K llamadas/mes). Aquí se sirve desde el edge de Cloudflare, así
   que el visitante nuevo también sale del edge y no del cupo (~1 llamada a Contentful
   por minuto por colo). Mismo patrón que functions/api/catalog.js.

   Devuelve el JSON CRUDO de la CDA (items[0].fields = la config) para que
   js/whatsapp.js siga extrayéndolo igual. La respuesta no incluye el token. */

const CDN = 'https://cdn.contentful.com';
const CONTENT_TYPE = 'whatsappWidget';
const TTL = 300; // s (5 min). La config del widget cambia rara vez.

function err(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  if (request.method !== 'GET') return err('Método no permitido.', 405);

  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/whatsapp-config', request.url).toString(), { method: 'GET' });

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

  if (!space || !token) {
    console.error('[whatsapp-config] faltan CONTENTFUL_SPACE_ID / CONTENTFUL_ACCESS_TOKEN.');
    return err('Config no disponible.', 503);
  }

  const url =
    CDN + '/spaces/' + space + '/environments/' + environment +
    '/entries?access_token=' + encodeURIComponent(token) +
    '&content_type=' + CONTENT_TYPE + '&limit=1';

  try {
    // Capa 2: cacheEverything cachea también la subrequest en el edge.
    const res = await fetch(url, { cf: { cacheTtl: TTL, cacheEverything: true } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[whatsapp-config] Contentful ' + res.status + ': ' + detail.slice(0, 200));
      return err('No pudimos leer la config.', 502);
    }
    const body = await res.text(); // reenvía el JSON crudo
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=' + TTL + ', s-maxage=' + TTL,
        'x-bq-cache': 'MISS',
      },
    });
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    console.error('[whatsapp-config]', e.message);
    return err('Error consultando la config.', 500);
  }
}
