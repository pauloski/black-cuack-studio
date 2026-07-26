#!/usr/bin/env bash
# BlackQuack — crea/actualiza la regla de Rate Limiting (WAF) de la zona.
#
# Rate Limiting es configuración de ZONA (no se despliega con wrangler). Este
# script la crea vía la API de Rulesets de Cloudflare, de forma idempotente:
# puedes correrlo las veces que quieras; actualiza la regla por su descripción
# sin duplicarla ni pisar otras reglas que ya tengas.
#
# Protege POST /api/checkout (Contentful + reserva atómica en D1 + creación de
# pago en Flow) y el webhook POST /api/flow/confirm del abuso: corta en el edge
# ANTES de ejecutar la Function.
#
# El webhook /api/flow/confirm se incluye porque recibe solo { token } y, sin
# límite, un atacante podría hacer POST masivos con tokens falsos para forzar
# llamadas salientes a Flow (payment/getStatus) — amplificación/DoS. La integridad
# del pedido nunca depende del token (la verdad es la respuesta firmada de Flow);
# esto es defensa de disponibilidad/costo.
#
# USO:
#   1) Crea un API Token de Cloudflare (30 s), scope MÍNIMO:
#        Dashboard → My Profile → API Tokens → Create Token → Custom token
#        Permiso:  Zone · WAF · Edit
#        Zone Resources: Include · Specific zone · <tu-dominio>
#   2) export CF_API_TOKEN="tu_token"
#   3) (opcional para forks) export CF_ZONE_ID="id_de_la_zona_del_cliente"
#   4) bash scripts/setup-ratelimit.sh
#
# Borra el token después si quieres — la regla queda persistida en Cloudflare.
#
# LLAVE EN MANO: para desplegar en la zona de otro cliente, exporta CF_ZONE_ID
# con el ID de su zona antes de correr el script. Si no se define, usa por
# defecto la zona de blackquack.cl (retrocompatibilidad).

set -euo pipefail

# Zona objetivo: parametrizable por env (CF_ZONE_ID) para el modelo llave-en-mano.
# Si no se define, cae en la zona de blackquack.cl.
ZONE_ID="${CF_ZONE_ID:-ebc74ef07b39694a69e93de5ab40a430}"   # default: blackquack.cl
API="https://api.cloudflare.com/client/v4"

if [ -z "${CF_API_TOKEN:-}" ]; then
  echo "✘ Falta CF_API_TOKEN. Exporta un token con permiso 'Zone · WAF · Edit' sobre la zona objetivo."
  echo "  export CF_API_TOKEN=\"...\"  &&  bash scripts/setup-ratelimit.sh"
  echo "  (forks: export CF_ZONE_ID=\"...\" para apuntar a la zona de otro cliente)"
  exit 1
fi

echo "→ Zona objetivo: $ZONE_ID"

# --- La regla deseada ---------------------------------------------------------
# 10 req / 10 s por IP sobre POST /api/checkout y POST /api/flow/confirm → Block
# por 10 s al excederse. El plan gratuito de Cloudflare solo permite period=10
# (no 60), y exige que 'cf.colo.id' acompañe a 'ip.src' (el conteo se procesa a
# nivel de datacenter). Acción 'block' (no challenge): ambos endpoints se llaman
# server-a-servidor / por fetch(), que no puede resolver un challenge; un
# managed_challenge rompería también a los legítimos (incluido el webhook de Flow).
DESC="BQ throttle checkout"
read -r -d '' DESIRED_RULE <<'JSON' || true
{
  "description": "BQ throttle checkout",
  "expression": "(http.request.uri.path eq \"/api/checkout\" or http.request.uri.path eq \"/api/flow/confirm\") and http.request.method eq \"POST\"",
  "action": "block",
  "ratelimit": {
    "characteristics": ["ip.src", "cf.colo.id"],
    "period": 10,
    "requests_per_period": 10,
    "mitigation_timeout": 10
  }
}
JSON

echo "→ Leyendo ruleset http_ratelimit de la zona…"
CURRENT=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "$API/zones/$ZONE_ID/rulesets/phases/http_ratelimit/entrypoint")

# Fusiona: conserva reglas ajenas, reemplaza la nuestra (misma descripción).
PAYLOAD=$(CURRENT_JSON="$CURRENT" DESIRED_JSON="$DESIRED_RULE" DESC="$DESC" python3 <<'PY'
import json, os
cur = json.loads(os.environ["CURRENT_JSON"])
desired = json.loads(os.environ["DESIRED_JSON"])
desc = os.environ["DESC"]
existing = (cur.get("result") or {}).get("rules") or [] if cur.get("success") else []
# quita cualquier versión previa de nuestra regla, conserva el resto
kept = [r for r in existing if r.get("description") != desc]
# reglas ya existentes se re-mandan solo con campos editables
def slim(r):
    out = {k: r[k] for k in ("description","expression","action","ratelimit","action_parameters","enabled") if k in r}
    return out
rules = [slim(r) for r in kept] + [desired]
print(json.dumps({"rules": rules}))
PY
)

echo "→ Aplicando regla (PUT entrypoint)…"
RESP=$(curl -s -X PUT \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD" \
  "$API/zones/$ZONE_ID/rulesets/phases/http_ratelimit/entrypoint")

echo "$RESP" | python3 <<'PY'
import sys, json
d = json.load(sys.stdin)
if not d.get("success"):
    print("✘ Falló:", json.dumps(d.get("errors"), ensure_ascii=False))
    sys.exit(1)
rules = (d.get("result") or {}).get("rules") or []
print("✓ Regla aplicada. Reglas de rate limiting activas en la zona:")
for r in rules:
    rl = r.get("ratelimit") or {}
    print(f"  · {r.get('description')}  [{r.get('action')}]  "
          f"{rl.get('requests_per_period')}/{rl.get('period')}s  expr: {r.get('expression')}")
PY
