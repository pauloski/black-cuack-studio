# worker-cron — barrido programado de reservas

Worker de Cloudflare **independiente** de Pages. Su único trabajo es correr, cada
20 min, el barrido de reservas abandonadas (`_lib/sweep-core.js`) directo sobre
los mismos D1 + KV que usa la tienda. Reemplaza al cron externo: todo queda
dentro de Cloudflare y no expone ninguna URL.

## Deploy (una vez)

```bash
cd worker-cron
npx wrangler deploy
```

Eso publica el Worker y registra el Cron Trigger. Luego carga los secretos de
Flow (las MISMAS llaves de producción que están en Pages):

```bash
npx wrangler secret put FLOW_API_KEY
npx wrangler secret put FLOW_SECRET_KEY
```

`FLOW_SANDBOX` ya va como variable en `wrangler.toml` (`"0"` = producción). Los
bindings `ORDERS_DB` (D1) y `ORDERS_KV` apuntan a los recursos reales por ID.

## Probar el barrido sin esperar al cron

```bash
npx wrangler dev --test-scheduled
# en otra terminal:
curl "http://localhost:8787/__scheduled?cron=*/20+*+*+*+*"
```

Los `console.log('[cron-sweep]', ...)` muestran el resultado. En producción se ven
con:

```bash
npx wrangler tail blackquack-cron
```

## Cambiar la frecuencia

Edita `crons` en `wrangler.toml` y vuelve a `npx wrangler deploy`. Ejemplos:
`"*/15 * * * *"` (cada 15 min), `"*/30 * * * *"` (cada 30 min).

## Notas

- Se despliega y versiona aparte de Pages. No afecta el build del sitio.
- El disparo manual sigue disponible en `admin.html` (para correrlo a demanda).
- La lógica no está duplicada: este Worker y `/api/admin/sweep` importan el mismo
  `functions/_lib/sweep-core.js`.
