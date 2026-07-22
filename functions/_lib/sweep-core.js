/* Barrido de reservas ABANDONADAS — lógica pura, sin HTTP ni secreto.

   Libera el stock de compras que se iniciaron pero nunca se pagaron. Opera SOLO
   sobre bindings (env.ORDERS_KV, env.ORDERS_DB) y Flow, así que la comparten dos
   invocadores:
   - functions/api/admin/sweep.js  → disparo MANUAL desde admin.html (con secreto).
   - worker-cron/src/index.js       → disparo PROGRAMADO (Cron Trigger), sin URL.

   Seguridad: antes de tocar el stock consulta Flow getStatus por cada orden:
   - PAGADA   → commit (red de seguridad si el webhook confirm falló); no libera.
   - NO pagada y vencida → libera el stock.
   - Error de Flow → NO toca (incierto), lo reporta para revisión manual. */

import { flowGet, FLOW_STATUS } from './flow.js';
import { releaseCart, commitCart } from './stock.js';

/* Lista todas las claves order:* del KV, siguiendo el cursor si hay muchas. */
async function listOrderKeys(kv) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: 'order:', limit: 1000, cursor });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}

/* Corre el barrido. olderThanMin: solo libera reservas más viejas que esta
   ventana (default 60 = ventana de pago de Flow). dryRun: no toca nada, reporta.
   Devuelve el detalle para mostrar/loguear. */
export async function runSweep(env, { olderThanMin = 60, dryRun = false } = {}) {
  const cutoffMs = Date.now() - olderThanMin * 60 * 1000;
  const result = { scanned: 0, candidates: 0, released: 0, committed: 0, skipped: 0, errors: 0, dryRun, details: [] };

  const keys = await listOrderKeys(env.ORDERS_KV);

  for (const key of keys) {
    result.scanned++;
    const token = key.slice('order:'.length);
    const order = await env.ORDERS_KV.get(key, 'json');
    if (!order || order.stock_state !== 'reserved') continue; // solo reservas vivas

    const createdMs = order.created_at ? new Date(order.created_at).getTime() : 0;
    const ageMs = createdMs ? Date.now() - createdMs : Infinity;
    if (createdMs > cutoffMs) continue; // aún dentro de la ventana de pago
    result.candidates++;

    // Verificar con Flow antes de tocar el stock.
    let status;
    try {
      const st = await flowGet(env, '/payment/getStatus', { token });
      status = Number(st?.status);
    } catch (e) {
      // Incierto: no liberamos. Puede que la orden ya no exista en Flow (muy vieja).
      result.errors++;
      result.details.push({ order: order.commerceOrder, action: 'skip-error', reason: e.message.slice(0, 80) });
      continue;
    }

    if (status === FLOW_STATUS.PAID) {
      // El webhook confirm no alcanzó a consumar: lo hacemos acá.
      if (!dryRun) {
        try {
          await commitCart(env.ORDERS_DB, order.lines || [], order.commerceOrder);
          // Red de seguridad si el webhook confirm no alcanzó: también avanza el
          // fulfillment a preparación (a menos que ya esté más adelante).
          var ff = order.fulfillment && order.fulfillment !== 'pendiente_pago' ? order.fulfillment : 'en_preparacion';
          await env.ORDERS_KV.put(key, JSON.stringify({ ...order, status: 'paid', stock_state: 'committed', fulfillment: ff, swept_at: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
        } catch (e) { result.errors++; continue; }
      }
      result.committed++;
      result.details.push({ order: order.commerceOrder, action: 'commit', reason: 'Flow reporta PAGADA' });
      continue;
    }

    // No pagada y vencida → liberar el stock retenido.
    if (!dryRun) {
      try {
        await releaseCart(env.ORDERS_DB, order.lines || [], order.commerceOrder);
        await env.ORDERS_KV.put(key, JSON.stringify({ ...order, status: 'abandoned', stock_state: 'released', swept_at: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
      } catch (e) { result.errors++; continue; }
    }
    result.released++;
    result.details.push({ order: order.commerceOrder, action: dryRun ? 'would-release' : 'release', flow_status: status, age_min: Math.round(ageMs / 60000) });
  }

  result.skipped = result.scanned - result.candidates;
  return result;
}
