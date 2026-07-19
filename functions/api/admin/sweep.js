/* POST|GET /api/admin/sweep?secret=...&olderThan=60&dryRun=0
   Header x-admin-secret: <secreto>  (mismo secreto que resync)

   Libera reservas ABANDONADAS: órdenes en estado 'reserved' cuya ventana de pago
   ya pasó y que Flow confirma NO pagadas. Devuelve el stock retenido a D1.

   Seguridad: antes de liberar, consulta Flow getStatus por cada orden:
   - PAGADA   → hace commit (red de seguridad si el webhook confirm falló); no libera.
   - NO pagada y vencida → libera el stock.
   - Error de Flow → NO toca (incierto), lo reporta para revisión manual.

   Cloudflare Pages no tiene cron: este endpoint se dispara desde fuera
   (cron-job.org / GitHub Actions / Worker con cron) o a mano desde admin.html. */

import { flowGet, FLOW_STATUS, json } from '../../_lib/flow.js';
import { releaseCart, commitCart } from '../../_lib/stock.js';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

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
  const cutoffMs = Date.now() - olderThanMin * 60 * 1000;

  const result = { scanned: 0, candidates: 0, released: 0, committed: 0, skipped: 0, errors: 0, dryRun, details: [] };

  let keys;
  try {
    keys = await listOrderKeys(env.ORDERS_KV);
  } catch (e) {
    console.error('[sweep] list KV:', e.message);
    return json({ error: 'No pudimos listar las órdenes.' }, 502);
  }

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
          await env.ORDERS_KV.put(key, JSON.stringify({ ...order, status: 'paid', stock_state: 'committed', swept_at: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
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
  console.log('[sweep]', JSON.stringify({ ...result, details: undefined }));
  return json({ ok: true, ...result });
}
