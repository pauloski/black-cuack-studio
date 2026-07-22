/* GET /api/shipping/methods
   Devuelve los métodos de despacho HABILITADOS en este ambiente (feature flag
   SHIPPING_METHODS). El checkout los usa para saber qué ofrecer: con uno solo va
   directo; con dos o más muestra el selector. */

import { json } from '../../_lib/flow.js';
import { enabledMethods } from '../../_lib/shipping-methods.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
  const methods = enabledMethods(env).map((m) => ({
    id: m.id, courier: m.courier, metodo: m.metodo,
    label: m.label, descripcion: m.descripcion, icon: m.icon,
    needsPunto: m.needsPunto, needsDireccion: m.needsDireccion,
  }));
  // Chilexpress requiere su key; si el método está habilitado pero falta la key, se avisa.
  const chxReady = !!env.CHX_RATING_KEY;
  return json({ ok: true, methods, chxReady });
}
