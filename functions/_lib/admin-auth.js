/* Autenticación de los endpoints de administración. Mismo criterio que sweep.js /
   resync-stock.js: secreto por header `x-admin-secret` (o ?secret=), comparado en
   tiempo constante contra ADMIN_RESYNC_SECRET. */

import { json } from './flow.js';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* Devuelve null si autoriza, o una Response de error (401/503) si no. */
export function requireAdmin(request, env) {
  if (!env.ADMIN_RESYNC_SECRET) {
    console.error('[admin] falta ADMIN_RESYNC_SECRET.');
    return json({ error: 'Admin no configurado.' }, 503);
  }
  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-secret') || url.searchParams.get('secret') || '';
  if (!safeEqual(provided, env.ADMIN_RESYNC_SECRET)) return json({ error: 'No autorizado.' }, 401);
  return null;
}
