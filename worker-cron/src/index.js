/* BlackQuack — Worker compañero con Cron Trigger.

   Único trabajo: correr el barrido de reservas abandonadas de forma PROGRAMADA,
   directo sobre los bindings D1 + KV (los MISMOS recursos que usa Pages). No
   expone HTTP ni secreto: el barrido automático nunca toca la red pública, así
   que no hay endpoint que proteger ni cron externo del que depender.

   La lógica es idéntica a /api/admin/sweep: ambos importan _lib/sweep-core.js. */

import { runSweep } from '../../functions/_lib/sweep-core.js';

export default {
  // Cloudflare invoca esto según los crons de wrangler.toml (por defecto cada 20 min).
  async scheduled(event, env, ctx) {
    const started = new Date().toISOString();
    try {
      const result = await runSweep(env, { olderThanMin: 60, dryRun: false });
      console.log('[cron-sweep]', started, JSON.stringify({ ...result, details: undefined }));
    } catch (e) {
      console.error('[cron-sweep] error:', e && e.message);
      // Relanzar para que Cloudflare marque la ejecución como fallida (visible en el panel).
      throw e;
    }
  }
};
