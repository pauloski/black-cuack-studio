/* POST /api/shipping/quote
   Body: { "comuna": "Providencia", "items": [{ "id": "BQ-001", "qty": 2 }] }
   Respuesta: { ok, costo, servicio, comuna } o { ok:false, error, noCoverage }.

   Cotiza el envío A DOMICILIO en vivo con Chilexpress. Lo llama el modal de
   checkout para MOSTRAR el costo. /api/checkout lo REVALIDA server-side antes de
   cobrar (nunca se confía en el costo que traiga el navegador). */

import { json } from '../../_lib/flow.js';
import { getCatalog, priceCart } from '../../_lib/catalog.js';
import { lookupComuna } from '../../_lib/comunas.js';
import { computeShipping } from '../../_lib/shipping-quote.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  if (!env.CHX_RATING_KEY) {
    console.error('[quote] falta CHX_RATING_KEY en el entorno.');
    return json({ ok: false, error: 'La cotización de envío no está disponible ahora.' }, 503);
  }

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'JSON inválido.' }, 400); }

  // La comuna define la cobertura: tiene que ser una comuna real (forma canónica).
  const found = lookupComuna(payload?.comuna);
  if (!found) return json({ ok: false, error: 'Selecciona una comuna válida.' }, 400);

  let catalog;
  try { catalog = await getCatalog(env); }
  catch (e) {
    console.error('[quote] catálogo:', e.message);
    return json({ ok: false, error: 'No pudimos validar el catálogo. Intenta en unos segundos.' }, 502);
  }

  // Valida los ítems y obtiene el valor declarado (priceCart no valida stock).
  const priced = priceCart(payload?.items, catalog);
  if (priced.error) return json({ ok: false, error: priced.error }, 400);

  const s = await computeShipping(env, catalog, found.comuna, priced.lines, priced.amount);
  if (!s.ok) {
    if (s.noCoverage) return json({ ok: false, error: s.error, noCoverage: true }, 200);
    console.warn('[quote] Chilexpress:', s.error, JSON.stringify(s.errors || ''));
    return json({ ok: false, error: s.error || 'No pudimos cotizar el envío.' }, 200);
  }

  return json({ ok: true, costo: s.costo, servicio: s.servicio, comuna: found.comuna });
}
