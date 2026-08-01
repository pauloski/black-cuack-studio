# Prompt de inicio — nuevo proyecto cliente

> Documento **de operador**. Contiene (A) el formulario de datos a recolectar del
> cliente, (B) el esquema completo de `brand.tokens.json`, y (C) un prompt listo
> para arrancar el proyecto (para pegar a un agente IA o usar como checklist).

---

## A. Formulario de intake (completar con el cliente)

```
CLIENTE
  nombre de la tienda:        ______________________
  slug (repo/proyecto):       tienda-______________
  tagline / eslogan:          ______________________
  email de contacto público:  ______________________
  dominio:                    ______________________.cl
  redes (ig/tiktok/fb):       ______________________

MARCA / DISEÑO
  logo (archivo svg/png):     ______________________
  color principal (brand):    #_________
  color acento (accent):      #_________
  color oscuro (texto):       #_________  (default #444444)
  fondo (bg):                 #_________  (default #FFFFFF)
  fuente títulos:             ______________________  (default Space Grotesk)
  fuente cuerpo:              ______________________  (default Plus Jakarta Sans)
  radio de bordes:            ____px       (default 14px)

CUENTAS (propiedad del cliente)
  correo nuevo del cliente:   ______________________
  Cloudflare Account ID:      ______________________
  Contentful Space ID:        ______________________
  Contentful CDA token:       ______________________  (público)
  Contentful CMA token:       ______________________  (secreto, migraciones)

PAGOS (Flow — cuenta del cliente)
  FLOW_API_KEY:               ______________________
  FLOW_SECRET_KEY:            ______________________  (secreto)

DESPACHO
  comuna de origen:           ______________________
  courier(s):                 Chilexpress / Blue / Shipit / ______
  llaves de courier:          ______________________

CATÁLOGO INICIAL
  n° de productos:            ____   (soporta hasta ~100; >100 requiere paginar)
  fuente (CSV/planilla):      ______________________
```

---

## B. Esquema de `brand.tokens.json`

Archivo único de marca por cliente. Se aplica **en runtime** (un `<script>` vanilla
lo lee y setea las variables CSS + textos de marca; cero build/comando). Alternativa
estática opcional: `node build-tokens.mjs` (JS puro, sin dependencias).

```json
{
  "brand": {
    "name": "Nombre Tienda",
    "tagline": "Eslogan corto",
    "email": "hola@dominio.cl",
    "domain": "dominio.cl",
    "orderPrefix": "XX-",
    "logo": "media/logo.svg",
    "socials": { "instagram": "", "tiktok": "", "facebook": "" }
  },
  "colors": {
    "brand": "#F39200",
    "accent": "#DEC520",
    "dark": "#444444",
    "bg": "#FFFFFF",
    "surfaceSoft": "#F1F1F1",
    "error": "#C0392B"
  },
  "fonts": {
    "title": "Space Grotesk",
    "body": "Plus Jakarta Sans",
    "display": "Archivo Black",
    "mono": "Space Mono"
  },
  "layout": { "radius": "14px", "maxWidth": "1280px" }
}
```

De aquí se derivan (en runtime o con el convertidor):
- Variables CSS de `:root`: `--color-brand, --color-accent, --color-dark,
  --bg-primary, --surface-soft, --color-error, --font-title, --font-body,
  --font-display, --font-mono, --border-radius, --maxw`.
- Config front: `window.SHOP_CONFIG.BRAND { name, tagline, email, orderPrefix,
  socials }` + IDs de Contentful.
- Brand backend: `{ name, orderPrefix }` (prefijo de orden).
- `<link>` de Google Fonts según `fonts`, y el favicon desde el logo.
- Verificación visual: `ds.html` (design system vivo).

---

## C. Prompt para arrancar (pegar a un agente / usar como guion)

```
Vas a aprovisionar una nueva tienda cliente a partir de la PLANTILLA
(tienda headless JAMstack, ver docs/producto/ESTRATEGIA.md y ARCHITECTURE.md).

CONTEXTO DEL MODELO:
- Arquitectura ÚNICA por cliente, en sus propias cuentas (Cloudflare + Contentful
  + Flow del cliente). No multi-tenant. Todo cabe en planes gratuitos por cliente.
- El motor (functions/, js/, css/bq-v5.css) NO se toca por cliente. Lo único que
  cambia es la PIEL: brand.tokens.json + media/logo + contenido en Contentful.
- Estilos: HTML5 + vanilla JS + CSS variables. La marca se compila desde
  brand.tokens.json, aplicado en runtime por un `<script>` vanilla (sin build/npm).

DATOS DEL CLIENTE:
<pegar aquí el formulario de intake completado de la sección A>

TAREAS (seguir docs/producto/RUNBOOK-APROVISIONAMIENTO.md):
1. Crear el repo del cliente desde la plantilla y enlazar `upstream`.
2. Escribir brand.tokens.json con los datos y copiar el logo a /media. (Runtime: se
   aplica solo; o `node build-tokens.mjs` si es estático.) Commitear y verificar en
   ds.html que colores/fuentes/nombre se reflejen.
3. Importar el modelo de contenido a Contentful del cliente (contentful-cli).
4. Crear D1 (+ schema.sql) y KV en el Cloudflare del cliente; pegar los bindings en
   wrangler.toml.
5. Setear env vars y secretos por ambiente (Production/Preview). FLOW_SANDBOX=1 en
   Preview, 0 en Production. Generar ADMIN_RESYNC_SECRET único.
6. Deploy y conectar el dominio.
7. Smoke test: home 200, /api/catalog con items y x-bq-cache HIT/MISS, y una compra
   de prueba end-to-end en sandbox.
8. Reportar: URLs, IDs de recursos creados, y qué quedó pendiente de traspaso.

REGLAS:
- No reutilizar secretos entre clientes. No commitear secretos reales (solo como env
  de Pages). No pisar .dev.vars.
- No modificar el motor para un cliente puntual; si algo falta, es cambio de la
  plantilla (upstream) para toda la flota.
- Confirmar antes de acciones destructivas o de traspasar propiedad de cuentas.
```

---

## Checklist de cierre (traspaso)

- [ ] Tienda en producción en el dominio del cliente (smoke test ok).
- [ ] Compra de prueba real (sandbox) validada de punta a punta.
- [ ] Claves de todas las cuentas transferidas al cliente.
- [ ] Mini-manual de operación entregado (productos, stock, órdenes).
- [ ] Contrato de mantenimiento definido (¿operador retiene acceso de deploy?).
- [ ] Cliente registrado en el inventario de flota (nombre → versión del motor).
