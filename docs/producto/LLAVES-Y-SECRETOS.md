# Llaves y secretos — paso a paso por plataforma

> Documento **de operador**. Todo lo que hay que generar/configurar en Cloudflare,
> Contentful y Flow para una instalación cliente. Cada cliente usa **sus propias
> llaves**; nunca reutilizar secretos entre clientes.

## Regla de oro: público vs. secreto

| Tipo | Ejemplos | Dónde puede vivir |
|---|---|---|
| **Público** (read-only, va al navegador) | Contentful **CDA token**, Flow **apiKey** | `brand.tokens.json` / config del front / repo |
| **Secreto** (firma / escritura / admin) | Flow **secretKey**, Contentful **CMA**, `ADMIN_RESYNC_SECRET` | **solo** como env de Cloudflare Pages · `.dev.vars` local (NUNCA commitear) |

Los secretos se cargan con `wrangler pages secret put <NOMBRE>` o en el dashboard de
Pages (Settings → Environment variables → *Encrypt*). **No pisar `.dev.vars`.**

---

## 1. Cloudflare

### 1.1 Cuenta y Account ID
1. Crear cuenta con el **correo del cliente** → Cloudflare Free.
2. **Account ID:** dashboard → cualquier dominio/Workers & Pages → panel derecho
   "Account ID". Se usa como `CLOUDFLARE_ACCOUNT_ID` para wrangler.

### 1.2 API Token (para wrangler / provisión)
1. My Profile → **API Tokens** → *Create Token* → *Custom token*.
2. Permisos mínimos:
   - `Account · Cloudflare Pages · Edit`
   - `Account · D1 · Edit`
   - `Account · Workers KV Storage · Edit`
   - `Account · Workers Scripts · Edit` (para el cron, si aplica)
3. Guardar el token (se muestra una sola vez) → exportar como `CLOUDFLARE_API_TOKEN`
   o usar `wrangler login`.

### 1.3 Recursos y sus IDs
- `wrangler d1 create <cliente>-stock` → devuelve **database_id** → a `wrangler.toml`.
- `wrangler kv namespace create ORDERS_KV` → devuelve **id** → a `wrangler.toml`.

### 1.4 Variables y secretos del proyecto Pages (Production **y** Preview)
En el proyecto Pages (Settings → Environment variables), por ambiente:

| Nombre | Tipo | Production | Preview |
|---|---|---|---|
| `CONTENTFUL_SPACE_ID` | var | space del cliente | igual |
| `CONTENTFUL_ACCESS_TOKEN` | var (CDA, público) | CDA del cliente | igual |
| `CONTENTFUL_ENVIRONMENT` | var | `master` | `master` |
| `FLOW_API_KEY` | var | apiKey **producción** | apiKey **sandbox** |
| `FLOW_SECRET_KEY` | **secret** | secret **producción** | secret **sandbox** |
| `FLOW_SANDBOX` | var | `0` | `1` |
| `ADMIN_RESYNC_SECRET` | **secret** | único del cliente | igual o distinto |
| `CHX_RATING_KEY` | **secret** | llave courier | sandbox si hay |
| `CHX_ORIGIN_COMUNA` | var | comuna de origen | igual |

> Regla clave: **Production = dinero real** (`FLOW_SANDBOX=0`, llaves de producción).
> **Preview = pruebas** (`FLOW_SANDBOX=1`, llaves sandbox). Nunca cruzar.

### 1.5 Dominio
- Agregar el dominio del cliente al proyecto Pages (Custom domains) y apuntar DNS.

---

## 2. Contentful

### 2.1 Space y environment
1. Crear cuenta Free con el **correo del cliente** → crear un **Space**.
2. `Settings → General settings` → copiar el **Space ID**.
3. Environment: `master` (default).

### 2.2 CDA token — Content Delivery (PÚBLICO, read-only)
1. `Settings → API keys` → *Add API key*.
2. Copiar el **Content Delivery API - access token** → es `CONTENTFUL_ACCESS_TOKEN`.
3. Es de solo lectura de contenido **publicado** → puede ir al navegador. *(En esta
   arquitectura ni siquiera llega al navegador: lo consume la Function `/api/catalog`.)*
4. *(Opcional)* el **Content Preview token (CPA)** del mismo panel, si se quiere
   previsualizar borradores.

### 2.3 CMA token — Content Management (SECRETO, escritura/migraciones)
1. `Settings → API keys → Content management tokens` (o tu perfil → *Personal Access
   Tokens*) → *Generate personal token*.
2. Guardar (se muestra una vez). Se usa **solo** para `contentful space import` y
   migraciones del modelo de contenido. **Nunca** en el navegador ni en el repo.

### 2.4 Modelo de contenido
- Importar el content model de la plantilla:
  `contentful space import --space-id <SPACE_ID> --management-token <CMA> --content-file templates/contentful-content-model.json`

### 2.5 App de stock (barra lateral)
- Registrar la App (`contentful-stock.html`) y setear su parámetro `adminSecret` =
  el `ADMIN_RESYNC_SECRET` del cliente. Ver `ARCHITECTURE.md §8.2`.

---

## 3. Flow (pagos)

> Flow entrega **dos pares** de llaves: uno **sandbox** (pruebas) y uno
> **producción** (dinero real). Cada par tiene `apiKey` (identificador) y
> `secretKey` (firma HMAC — **secreto**).

### 3.1 Obtener las llaves
1. El cliente debe tener su **cuenta comercial Flow** activa (a su nombre/RUT).
2. En el panel de Flow → sección de **integración / API** → copiar:
   - **Sandbox:** `apiKey` + `secretKey` (para el ambiente de pruebas).
   - **Producción:** `apiKey` + `secretKey` (para cobrar de verdad).

### 3.2 Dónde van
- `FLOW_API_KEY` → var de Pages (público-ish).
- `FLOW_SECRET_KEY` → **secret** de Pages (firma HMAC, jamás al navegador ni al repo).
- Preview usa el par **sandbox** + `FLOW_SANDBOX=1`; Production usa el par
  **producción** + `FLOW_SANDBOX=0`.

### 3.3 Configurar el retorno/confirmación en Flow
- El backend expone el webhook `POST /api/flow/confirm` (servidor-a-servidor) y la
  URL de retorno del cliente. Registrar el dominio del cliente en Flow para que el
  callback llegue a `https://<dominio>/api/flow/confirm`.
- El pago se valida **siempre** con `getStatus` firmado (el token del callback NO
  prueba el pago). Ver `ARCHITECTURE.md` (flujo de checkout).

### 3.4 Prueba
- Con `FLOW_SANDBOX=1` (Preview), hacer una compra de punta a punta en sandbox
  antes de activar producción.

---

## 4. Admin y otros secretos

- `ADMIN_RESYNC_SECRET`: generar aleatorio fuerte por cliente
  (`openssl rand -base64 24`). Protege `admin.html` y la app de stock.
- Courier (Chilexpress `CHX_RATING_KEY` / Shipit token / etc.): según el courier
  elegido por el cliente.

---

## 5. Matriz resumen (qué va dónde)

| Secreto/llave | Plataforma | Público/Secreto | Vive en |
|---|---|---|---|
| Contentful CDA token | Contentful | Público | env Pages (`CONTENTFUL_ACCESS_TOKEN`) |
| Contentful CMA token | Contentful | **Secreto** | gestor de contraseñas del operador (solo migraciones) |
| Flow apiKey | Flow | Público-ish | env Pages (`FLOW_API_KEY`) |
| Flow secretKey | Flow | **Secreto** | secret Pages (`FLOW_SECRET_KEY`) |
| ADMIN_RESYNC_SECRET | propio | **Secreto** | secret Pages + param de la app de stock |
| Courier key | Chilexpress/Shipit | **Secreto** | secret Pages (`CHX_RATING_KEY`…) |
| Cloudflare API Token | Cloudflare | **Secreto** | gestor del operador (wrangler/CI) |

## 6. Buenas prácticas

- **Un set de secretos por cliente.** Nunca compartir entre instalaciones.
- **Nada de secretos en git.** Solo `wrangler pages secret put` / dashboard.
- **`.dev.vars`** solo para desarrollo local; está en `.gitignore`; **no pisar**.
- **Rotación:** si un secreto se expone, rotarlo en la plataforma y actualizar el
  env de Pages (y `.dev.vars` local). Los tokens CDA/apiKey públicos son de bajo
  riesgo; los `secretKey`/CMA/admin son críticos.
- **Traspaso al cliente:** al cerrar, transferir la propiedad de las cuentas
  (correo + claves) al cliente; definir si el operador retiene acceso para soporte.
