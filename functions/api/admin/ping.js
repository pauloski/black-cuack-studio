/* GET /api/admin/ping
   Header  x-admin-secret: <secreto>

   Verifica el secreto de administración sin efectos secundarios. Lo usa el gate
   de login de admin.html: 200 → deja entrar; 401 → secreto incorrecto. */

import { json } from '../../_lib/flow.js';
import { requireAdmin } from '../../_lib/admin-auth.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  return json({ ok: true });
}
