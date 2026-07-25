/* POST /api/admin/stock-adjust
   Header  x-admin-secret: <secreto>
   Body    { product, variantKey, delta, motivo }

   Reabastecimiento / merma por DELTA sobre D1 (qty = qty + delta). Aditivo, así
   que es SEGURO aunque haya reservas en vuelo (a diferencia de resync-stock, que
   machaca con el valor absoluto de Contentful). Registra el movimiento en el
   ledger con reason 'adjust'. */

import { adjustStock } from '../../_lib/stock.js';
import { json } from '../../_lib/flow.js';
import { requireAdmin } from '../../_lib/admin-auth.js';

const MAX_DELTA = 100000; // tope anti-dedazo

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!env.ORDERS_DB) return json({ error: 'D1 no disponible.' }, 503);

  const denied = requireAdmin(request, env);
  if (denied) return denied;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido.' }, 400); }

  const product = String(body?.product || '').trim();
  const key = body?.variantKey != null ? String(body.variantKey) : '';
  const delta = Math.trunc(Number(body?.delta));
  const motivo = String(body?.motivo || '').trim().slice(0, 120);

  if (!product) return json({ error: 'Falta el producto.' }, 400);
  if (!Number.isFinite(delta) || delta === 0) {
    return json({ error: 'El ajuste debe ser un entero distinto de 0.' }, 400);
  }
  if (Math.abs(delta) > MAX_DELTA) return json({ error: 'Ajuste fuera de rango.' }, 400);

  const r = await adjustStock(env.ORDERS_DB, product, key, delta, motivo || 'ajuste manual');
  if (!r.ok) return json({ error: r.error || 'No se pudo ajustar.' }, r.notFound ? 404 : 409);

  console.log('[admin/stock-adjust]', product, key || '(simple)', (delta > 0 ? '+' : '') + delta, '→', r.new, motivo ? '· ' + motivo : '');
  return json({ ok: true, product, variantKey: key, old: r.old, new: r.new, delta: r.delta });
}
