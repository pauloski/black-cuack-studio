/* POST /api/shipping/quote
   Body: { "method": "blue_retiro"|"chilexpress_domicilio", "comuna": "...", "items": [...] }
   Respuesta: { ok, costo, servicio, courier, metodo, comuna, entrega } o { ok:false, error }.

   - blue_retiro: costo desde la TABLA (Blue no tiene API). + fecha estimada.
   - chilexpress_domicilio: cotización EN VIVO con Chilexpress.
   Se muestra en el checkout; /api/checkout lo RECALCULA antes de cobrar. */

import { json } from '../../_lib/flow.js';
import { getCatalog, priceCart } from '../../_lib/catalog.js';
import { lookupComuna } from '../../_lib/comunas.js';
import { computeShipping } from '../../_lib/shipping-quote.js';
import { estimateDelivery } from '../../_lib/delivery-estimate.js';
import { bluePickupRate } from '../../_lib/blue-rates.js';
import { methodById, isMethodEnabled } from '../../_lib/shipping-methods.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'JSON inválido.' }, 400); }

  const methodId = String(payload?.method || 'blue_retiro');
  const method = methodById(methodId);
  if (!method || !isMethodEnabled(env, methodId)) {
    return json({ ok: false, error: 'Método de despacho no disponible.' }, 400);
  }

  const found = lookupComuna(payload?.comuna);
  if (!found) return json({ ok: false, error: 'Selecciona una comuna válida.' }, 400);

  const entrega = estimateDelivery(found.comuna);

  // ---- Blue Express: retiro en Punto Blue (tabla) ----
  if (method.courier === 'blue') {
    const r = bluePickupRate(found.comuna);
    if (!r.ok) return json({ ok: false, error: r.error }, 200);
    return json({
      ok: true, courier: 'blue', metodo: 'retiro_punto',
      costo: r.costo, servicio: 'Punto Blue', comuna: found.comuna, entrega,
    });
  }

  // ---- Chilexpress: domicilio (API en vivo) ----
  if (!env.CHX_RATING_KEY) {
    return json({ ok: false, error: 'La cotización a domicilio no está disponible ahora.' }, 503);
  }
  let catalog;
  try { catalog = await getCatalog(env); }
  catch (e) { console.error('[quote] catálogo:', e.message); return json({ ok: false, error: 'No pudimos validar el catálogo.' }, 502); }

  const priced = priceCart(payload?.items, catalog);
  if (priced.error) return json({ ok: false, error: priced.error }, 400);

  const s = await computeShipping(env, catalog, found.comuna, priced.lines, priced.amount);
  if (!s.ok) {
    if (s.noCoverage) return json({ ok: false, error: s.error, noCoverage: true }, 200);
    console.warn('[quote] Chilexpress:', s.error);
    return json({ ok: false, error: s.error || 'No pudimos cotizar el envío.' }, 200);
  }
  return json({
    ok: true, courier: 'chilexpress', metodo: 'domicilio',
    costo: s.costo, servicio: s.servicio, comuna: found.comuna, entrega,
  });
}
