# Runbook de aprovisionamiento — nueva tienda cliente

> Documento **de operador**. Convierte cada entrega en un proceso repetible.
> Objetivo: pasar de "un cliente nuevo" a "tienda en producción en su cuenta" en
> ~30–45 min, sin improvisar.

## 0. Prerrequisitos del operador (una sola vez)

- CLI instaladas: `git`, `gh` (GitHub), `wrangler` (Cloudflare), `contentful-cli`,
  `node` (para `build-tokens`).
- La **plantilla** publicada como *GitHub Template Repository* (ej.
  `spotmind/tienda-soberana-template`).
- Un gestor de contraseñas para los secretos por cliente.

## 1. Datos que pide el cliente (input)

Recolectar ANTES de empezar (ver `PROMPT-NUEVO-CLIENTE.md` para el formato):
marca (nombre, tagline, logo, colores, fuentes), dominio, correo del cliente,
datos de Flow (API key + secret de su cuenta), origen de despacho (comuna),
courier(s), catálogo inicial (productos con precio/stock/fotos/dimensiones).

## 2. Crear las cuentas del cliente (propiedad del cliente)

1. **Correo** nuevo del cliente (idealmente creado con el cliente presente, o con
   traspaso de clave al final).
2. **Cloudflare** (Free) con ese correo → anotar Account ID.
3. **Contentful** (Free) con ese correo → crear space, anotar Space ID + generar
   **CDA token** (Delivery) y un **CMA token** (Management, para migraciones).
4. **Flow**: el cliente ya debe tener su cuenta comercial; recolectar sus llaves.
5. **Dominio**: registrar / apuntar a Cloudflare.

> Todas estas cuentas quedan a nombre del cliente. El operador solo las administra
> durante el setup y el contrato de soporte.

## 3. Crear el repo del cliente desde la plantilla

```bash
# Desde la plantilla (Use this template) — repo autocontenido del cliente:
gh repo create <org>/tienda-<cliente> --template <org>/tienda-soberana-template --private
git clone git@github.com:<org>/tienda-<cliente>.git && cd tienda-<cliente>

# Enlazar la plantilla como upstream para futuros updates del motor:
git remote add upstream git@github.com:<org>/tienda-soberana-template.git
```

## 4. Aplicar la marca (token.json → compilar)

```bash
# Editar el único archivo de marca:
$EDITOR brand.tokens.json        # nombre, colores, fuentes, dominio, orderPrefix…
cp <logo-del-cliente> media/logo.svg

# Aplicar la marca: con el enfoque RUNTIME no hay comando — el token se lee en el
# navegador. (Alternativa estática: `node build-tokens.mjs`, JS puro sin dependencias.)
# Verificar la marca abriendo ds.html (design system vivo): colores/fuentes/nombre.

git add -A && git commit -m "brand: <cliente> (tokens + logo)"
```

## 5. Provisionar Contentful (contenido)

```bash
# Recrear el modelo de contenido en el space del cliente (idempotente):
contentful space import --space-id <SPACE_ID> --management-token <CMA> \
  --content-file templates/contentful-content-model.json

# (Opcional) cargar el catálogo inicial del cliente desde un CSV/JSON preparado.
```

## 6. Provisionar Cloudflare (Pages + D1 + KV)

```bash
export CLOUDFLARE_ACCOUNT_ID=<account-del-cliente>

# D1 (stock) + esquema:
wrangler d1 create <cliente>-stock
wrangler d1 execute <cliente>-stock --file=schema.sql --remote

# KV (órdenes):
wrangler kv namespace create ORDERS_KV

# Pega los IDs generados en wrangler.toml (bindings ORDERS_DB / ORDERS_KV).

# Crear el proyecto Pages conectado al repo (o `wrangler pages deploy .`):
wrangler pages project create tienda-<cliente> --production-branch main
```

## 7. Variables de entorno y secretos (por ambiente)

En el proyecto Pages del cliente (Production y Preview), setear:

```
CONTENTFUL_SPACE_ID, CONTENTFUL_ACCESS_TOKEN, CONTENTFUL_ENVIRONMENT=master
FLOW_API_KEY, FLOW_SECRET_KEY, FLOW_SANDBOX (0 prod / 1 preview)
ADMIN_RESYNC_SECRET  (generar único por cliente)
CHX_RATING_KEY, CHX_ORIGIN_COMUNA  (o llaves del courier elegido)
```

> El CDA token también va en `brand.tokens.json`/`config.generated.js` (público por
> diseño). Los **secretos reales** (Flow secret, admin secret) SOLO como env de
> Pages, nunca en el repo. No pisar `.dev.vars`.

## 8. Deploy y dominio

```bash
git push               # Cloudflare Pages construye y publica
# Conectar el dominio del cliente al proyecto Pages (Custom domain).
```

## 9. Configurar la app de stock en Contentful (opcional)

Registrar la App de barra lateral (`contentful-stock.html`) en el space del cliente
y setear `adminSecret` = el `ADMIN_RESYNC_SECRET` del cliente. Ver `ARCHITECTURE.md §8.2`.

## 10. Verificación (smoke test)

```bash
curl -sL -o /dev/null -w "%{http_code}\n" https://<dominio>/                    # 200
curl -s https://<dominio>/api/catalog | head -c 200                            # items
curl -s -D - -o /dev/null https://<dominio>/api/catalog | grep -i x-edge-cache  # HIT/MISS del edge
```
- Hacer una **compra de prueba** en sandbox (FLOW_SANDBOX=1) de punta a punta.
- Confirmar stock atómico, correo/estado de orden, tracking.

## 11. Traspaso al cliente

- Transferir claves de correo/Cloudflare/Contentful/Flow al cliente.
- Entregar mini-manual de operación (subir productos, ajustar stock, ver órdenes).
- Definir el contrato de **mantenimiento/soporte** y si el operador retiene acceso
  de deploy para parches de la flota.

---

## Diseño del script `scripts/provision.mjs` (semi-automatiza 3–8)

Un script Node que orquesta lo repetible leyendo un `client.json`:

```
node scripts/provision.mjs client.json
  1. lee client.json (marca + IDs de cuentas + secretos)
  2. escribe brand.tokens.json y corre build-tokens
  3. contentful space import  (modelo de contenido)
  4. wrangler d1 create + execute schema.sql ; wrangler kv namespace create
  5. inyecta IDs en wrangler.toml
  6. wrangler pages project create + set env/secrets (wrangler pages secret put)
  7. git commit + push  → deploy
  8. corre el smoke test del paso 10 y reporta
```

> Empezar por el **runbook manual** (este doc) para 2–3 clientes; automatizar con
> `provision.mjs` los pasos que se vuelvan mecánicos. La automatización total no es
> requisito para arrancar; el runbook sí.

## Actualizar la flota (mantenimiento)

```bash
# Por cada repo de cliente:
git fetch upstream && git merge upstream/main   # trae mejoras del motor
# (runtime: nada que regenerar; convertidor estático: node build-tokens.mjs)
git push                                          # redeploy automático
# Registrar: cliente <X> → versión <vN>.
```
