/* POST|GET /api/admin/sweep?olderThan=60&dryRun=1
   Header x-admin-secret: <secreto>  (mismo secreto que resync)

   Disparo MANUAL del barrido de reservas abandonadas, desde admin.html. La
   lógica vive en _lib/sweep-core.js y la comparte el Worker con Cron Trigger
   (worker-cron/), que corre el MISMO barrido de forma programada sin exponer
   esta URL ni ningún secreto. Este endpoint es solo para correrlo a mano. */

import { json } from '../../_lib/flow.js';
import { runSweep } from '../../_lib/sweep-core.js';

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
  if (!env.ORDERS_KV || !env.ORDERS_DB) return json({ error: 'KV o D1 no disponible.' }, 503);
  if (!env.ADMIN_RESYNC_SECRET) {
    console.error('[sweep] falta ADMIN_RESYNC_SECRET.');
    return json({ error: 'Sweeper no configurado.' }, 503);
  }

  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-secret') || url.searchParams.get('secret') || '';
  if (!safeEqual(provided, env.ADMIN_RESYNC_SECRET)) return json({ error: 'No autorizado.' }, 401);

  // Solo se liberan reservas más viejas que esta ventana (min). Default 60 = ventana de Flow.
  // Ojo: un olderThan=0 explícito es válido (barrer todo), no debe caer al default.
  const rawOlder = url.searchParams.get('olderThan');
  const olderThanMin = rawOlder != null && rawOlder !== '' ? Math.max(0, Number(rawOlder) || 0) : 60;
  const dryRun = url.searchParams.get('dryRun') === '1';

  let result;
  try {
    result = await runSweep(env, { olderThanMin, dryRun });
  } catch (e) {
    console.error('[sweep] barrido:', e.message);
    return json({ error: 'No pudimos completar el barrido.' }, 502);
  }

  console.log('[sweep]', JSON.stringify({ ...result, details: undefined }));
  return json({ ok: true, ...result });
}
