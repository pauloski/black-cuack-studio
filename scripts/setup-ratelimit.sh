#!/usr/bin/env bash
# BlackQuack — crea/actualiza la regla de Rate Limiting (WAF) de la zona.
#
# Rate Limiting es configuración de ZONA (no se despliega con wrangler). Este
# script la crea vía la API de Rulesets de Cloudflare, de forma idempotente:
# puedes correrlo las veces que quieras; actualiza la regla por su descripción
# sin duplicarla ni pisar otras reglas que ya tengas.
#
# Protege POST /api/checkout (Contentful + reserva atómica en D1 + creación de
# pago en Flow) del abuso: corta en el edge ANTES de ejecutar la Function.
#
# USO:
#   1) Crea un API Token de Cloudflare (30 s), scope MÍNIMO:
#        Dashboard → My Profile → API Tokens → Create Token → Custom token
#        Permiso:  Zone · WAF · Edit
#        Zone Resources: Include · Specific zone · blackquack.cl
#   2) export CF_API_TOKEN="tu_token"
#   3) bash scripts/setup-ratelimit.sh
#
# Borra el token después si quieres — la regla queda persistida en Cloudflare.

set -euo pipefail

ZONE_ID="ebc74ef07b39694a69e93de5ab40a430"   # blackquack.cl
API="https://api.cloudflare.com/client/v4"

if [ -z "${CF_API_TOKEN:-}" ]; then
  echo "✘ Falta CF_API_TOKEN. Exporta un token con permiso 'Zone · WAF · Edit' sobre blackquack.cl."
  echo "  export CF_API_TOKEN=\"...\"  &&  bash scripts/setup-ratelimit.sh"
  exit 1
fi

# --- La regla deseada ---------------------------------------------------------
# 10 req/min por IP sobre POST /api/checkout → Block por 60 s al excederse.
# Acción 'block' (no challenge): /api/checkout se llama por fetch(), que no puede
# resolver un challenge; un managed_challenge rompería también a los legítimos.
DESC="BQ · throttle POST /api/checkout por IP"
read -r -d '' DESIRED_RULE <<'JSON' || true
{
  "description": "BQ · throttle POST /api/checkout por IP",
  "expression": "(http.request.uri.path eq \"/api/checkout\" and http.request.method eq \"POST\")",
  "action": "block",
  "ratelimit": {
    "characteristics": ["ip.src", "cf.colo.id"],
    "period": 60,
    "requests_per_period": 10,
    "mitigation_timeout": 60
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
