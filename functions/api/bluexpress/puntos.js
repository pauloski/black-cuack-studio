/* GET /api/bluexpress/puntos — puntos de retiro Blue Express.

   POC del courier Blue Express. Sirve los puntos ya adelgazados y FILTRADOS:
   el dataset completo son 2.850 puntos / ~11 MB, jamás se manda entero al
   navegador. El checkout consulta por comuna (o por cercanía con lat/lng) y
   recibe solo lo que necesita para el selector y el mapa.

   Parámetros (todos opcionales, se combinan con AND):
     comuna    nombre de comuna, sin distinguir tildes/mayúsculas  (?comuna=quilpue)
     comunaId  id de comuna Blue                                    (?comunaId=1101)
     region    nombre de región                                     (?region=valparaiso)
     regionId  id de región Blue
     tipo      "Punto Blue Express" | "Punto Blue Express Copec"
     q         texto libre (nombre + dirección)
     lat,lng   ordena por cercanía y agrega distanciaKm a cada punto
     limit     máximo de resultados (default 60, tope 300)

   Sin ningún filtro NO devuelve los 2.850: exige acotar (evita respuestas
   gigantes por error). Para explorar sin filtro usar ?limit=... explícito. */

import { buscarPuntos, totalPuntos } from '../../_lib/blue-puntos.js';

const LIMIT_DEFAULT = 60;
const LIMIT_MAX = 300;

export async function onRequest({ request }) {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Método no permitido.' }, 405);
  }

  const { searchParams } = new URL(request.url);
  const get = (k) => {
    const v = searchParams.get(k);
    return v === null || v === '' ? undefined : v;
  };

  const opts = {
    comuna: get('comuna'),
    comunaId: get('comunaId'),
    region: get('region'),
    regionId: get('regionId'),
    tipo: get('tipo'),
    q: get('q'),
    lat: get('lat'),
    lng: get('lng'),
  };

  const tieneFiltro = Object.values(opts).some((v) => v !== undefined);
  const limitPedido = get('limit');

  // Salvaguarda: sin filtro y sin limit explícito, no volcamos todo el dataset.
  if (!tieneFiltro && limitPedido === undefined) {
    return json({
      ok: false,
      error:
        'Especifica un filtro (comuna, region, q o lat/lng) o un limit explícito. ' +
        'El dataset completo son ' + totalPuntos() + ' puntos.',
      total: totalPuntos(),
    }, 400);
  }

  let limit = Number(limitPedido ?? LIMIT_DEFAULT);
  if (!Number.isFinite(limit) || limit <= 0) limit = LIMIT_DEFAULT;
  limit = Math.min(limit, LIMIT_MAX);

  const encontrados = buscarPuntos(opts);
  const puntos = encontrados.slice(0, limit);

  return json({
    ok: true,
    total: encontrados.length,       // total que matchea el filtro
    mostrados: puntos.length,        // recortado por limit
    limit,
    puntos,
  });
}

/* Response JSON con caché fuerte: el dataset es prácticamente estático, así que
   dejamos que el edge y el navegador lo cacheen por clave (querystring). */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control':
        status === 200
          ? 'public, max-age=3600, s-maxage=86400'
          : 'no-store',
    },
  });
}
