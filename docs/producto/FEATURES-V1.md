# Features del boilerplate — menú completo + selección v1

> Documento **de operador**. Qué funciones de las plataformas grandes (Shopify,
> Jumpseller) vale la pena tomar para la plantilla **sin volverse un monstruo**, y
> el análisis profundo de las elegidas para la **primera versión**.

## Filosofía

No perseguir paridad con Shopify — la mitad de su lista es *plataforma de
marketing/CRM* que el emprendedor objetivo no usa y que sería un monstruo de
mantener. Meta: cubrir el **~80% que sí se usa**, barato. **Ventaja estructural:**
como el catálogo ya vive en el navegador (cacheado), varias "features premium"
(búsqueda, filtros, relacionados, favoritos) son **gratis, instantáneas y sin
backend**. Todas estas features viven en el **repo plantilla** (una vez para toda la
flota), no por cliente.

## Ya lo tenemos (que ellos cobran)

Temas/plantillas (tokens + `ds.html`) · productos "ilimitados" (falta paginar >100) ·
checkout real + Flow · gestión de inventario (D1 + app de stock) · chat (widget
WhatsApp) · SEO base (sitemap dinámico, schema.org, URLs limpias).

## Menú por prioridad

### Tier 1 — tomar (alto valor, bajo costo, encaja)
- Búsqueda con autocompletado (client-side) — llena `buscar.html`.
- Filtros de producto (categoría/precio/atributos) — client-side.
- Cupones / códigos de descuento — validados server-side en `/api/checkout`.
- Feed de productos (Google Merchant / Meta) — Function tipo sitemap.
- Productos relacionados / cross-sell — client-side por categoría.
- SEO+ (Open Graph/Twitter cards, meta por producto, breadcrumbs).
- Favoritos / wishlist (localStorage).
- Analítica (Cloudflare Web Analytics + mini-dashboard de ventas).

### Tier 2 — opcional (necesita algo más de infra)
- Recuperación de carrito abandonado + "vuelve a stock" (requieren email).
- Reseñas de productos (versión liviana, moderada en Contentful).
- Gift cards (código + saldo en D1).
- Descripciones con IA (herramienta de operador, no runtime).

### Tier 3 — saltar / externalizar (esto sería el monstruo)
- Cuentas de clientes / login → quedarse en **guest checkout** (ya hay tracking por código).
- Mercado Libre / sync de marketplace → **add-on premium** futuro, no en la base.
- Email marketing "full" (campañas, automations, segmentos complejos) → tercero (Brevo/Mailchimp) *(pero ver v1 nota abajo: haremos una versión acotada con Resend)*.
- Multi-sucursal, POS, reservas, suscripciones → otro alcance.

---

# Selección v1 — análisis profundo

Seis features para la primera versión. Al final, dependencias nuevas y orden de construcción.

## 1. Email (Resend) — transaccional primero, campañas acotadas después

**El matiz clave:** Resend es una **API de ENVÍO** de correo (con buena doc y capa
gratuita ~3.000/mes), **no** una plataforma de gestión de campañas. Lo barato/fácil
es el *envío*; el "monstruo" es la *gestión* (segmentos, plantillas drag-drop,
automations, deliverability, bajas). Por eso lo dividimos:

**v1 — Correos transaccionales (alto valor, bajo esfuerzo):** disparados por eventos
que **ya tienes**. Hoy probablemente la tienda **no envía ni la confirmación de
compra** — esto solo ya es un salto enorme.
- Confirmación de pedido (al pagar, en `flow/confirm`).
- Estado de pago / despacho + número de seguimiento.
- (Tier 2) Nudge de **carrito abandonado** y aviso **"vuelve a stock"** (usa el cron).

**v1.5 — Campañas/segmentos acotados (sin ser monstruo):**
- **Contactos**: se guardan los que **opt-in** en el checkout, en D1/KV.
- **Segmentos simples**: "todos", "compró categoría X", "última compra > N días".
- **Composer básico** en el admin: asunto + cuerpo (HTML simple) → enviar a un
  segmento vía Resend. **Sin** editor visual ni flujos automáticos.
- **Baja (unsubscribe)** en cada correo + registro de bajas. **Obligatorio legal.**

**Arquitectura:** Functions llaman a la HTTP API de Resend
(`POST https://api.resend.com/emails`, `Authorization: Bearer <key>`). Contactos y
log de envíos en D1. Cron para abandonados/programados.

**Dependencias por cliente:** cuenta Resend + API key; **dominio verificado**
(DNS: SPF/DKIM/DMARC) para que los correos no caigan en spam; captura de consentimiento
en checkout; mecanismo de baja.

**Cumplimiento:** consentimiento + baja fácil (Ley 19.628 y normas anti-spam). El
transaccional (confirmación de compra) no requiere opt-in; el marketing sí.

**Complejidad:** transaccional 🟢 bajo · campañas acotadas 🟡 medio. **Decisión:**
arrancar SOLO transaccional en v1; campañas en v1.5 con el alcance de arriba.

## 2. Analítica — Cloudflare Web Analytics + dashboard NUEVO y moderno

Dos piezas independientes:

**a) Tráfico — Cloudflare Web Analytics (gratis, sin cookies).** Un beacon JS (con el
token del cliente) → visitas, visitantes, referrers, top páginas, Core Web Vitals.
**Sin banner de cookies** (no usa cookies) y **cero backend**. Se inyecta en el engine.

**b) Ventas — mini-dashboard NUEVO en el admin.** Lee lo que **ya existe**:
- **Órdenes (KV)** → ingresos, N° de pedidos, ticket promedio, ventas en el tiempo,
  estados (pagado/rechazado), top productos.
- **`stock_ledger` (D1)** → movimientos, best-sellers (entradas `reserve`/`commit`),
  alertas de stock bajo.

**Diseño (importante):** página **nueva, moderna y marca-neutral** — NO el look del
admin actual. KPI-tiles + un gráfico + tablas, limpio. Al construir los gráficos,
**cargar la skill `dataviz`** para que se vea consistente y profesional.

**Nota técnica:** KV no agrega (no hay queries); a esta escala se **escanean** las
órdenes en una Function (`/api/admin/metrics`) y se agregan en JS — perfectamente bien
para pocos cientos de pedidos/mes. Si algún día escala, se indexa en D1.

**Complejidad:** 🟢 bajo (los datos ya están). **Dependencia por cliente:** token de
Cloudflare Web Analytics.

## 3. SEO+ — Open Graph / Twitter cards + meta por producto + breadcrumbs

**Qué agrega:**
- **Open Graph + Twitter Card** por producto (`og:title/description/image/url/type`,
  `twitter:card=summary_large_image`) → al compartir el link en WhatsApp/IG/FB sale
  con **imagen + título + precio** (hoy sale pelado).
- **Meta por producto** desde Contentful (title + description SEO) → mejor ranking.
- **Breadcrumbs** (JSON-LD `BreadcrumbList`: Inicio › Categoría › Producto) → Google
  muestra la miga de pan en resultados.

**⚠️ El punto clave (honesto):** la PDP se arma **client-side** (`producto.html?id=`).
Los **scrapers sociales** (WhatsApp, Facebook, Twitter) **NO ejecutan JS**, así que
las etiquetas OG inyectadas por JS **no las ven** → la preview sale mal. Para que el
compartir funcione de verdad hay que **inyectar la meta en el servidor**: una Pages
Function que intercepte la ruta del producto y con **HTMLRewriter** inserte las
etiquetas OG/meta en el HTML (leyendo el catálogo cacheado) **antes** de servirlo.
Google sí ejecuta JS (el ranking funciona client-side), pero el **social preview no**.

**Complejidad:** schema/breadcrumbs 🟢 bajo · OG-para-social 🟡 medio (necesita la
Function con HTMLRewriter). **Decisión:** hacer las dos; el HTMLRewriter es lo que da
el valor real de compartir.

## 4. Feed de productos (Google Merchant / Meta) — qué es y cómo

**Qué es:** un **archivo estructurado** (XML/CSV) que lista todos tus productos con
campos estándar: `id, title, description, link, image_link, price, availability,
brand, condition, gtin/mpn…`. Le entregas la **URL del feed** a **Google Merchant
Center** y a **Meta Commerce Manager**, y ellos lo leen periódicamente.

**Para qué sirve:** es el **puente** que hace que tus productos:
- Aparezcan en **Google Shopping** y en las **fichas gratuitas de productos** de Google.
- Se puedan **etiquetar en Instagram/Facebook** (shop + catálogo) y usar en **anuncios
  dinámicos de retargeting**. No rehaces la tienda en esas plataformas: **solo les das
  de comer tu catálogo.**

**Cómo en nuestra arquitectura:** una Function (`/feed.xml`) que lee el **mismo
catálogo cacheado** (Contentful) y lo emite en el **formato de feed de Google**
(RSS 2.0 con namespace `g:`; Meta acepta un feed equivalente). Es **exactamente el
mismo patrón que el `sitemap.xml` dinámico que ya tienes**, con otro formato de
salida. Cacheado en el edge → costo cero.

**El cliente luego:** crea su cuenta gratis en Google Merchant Center / Meta Commerce
Manager, pega la URL del feed, y listo — se sincroniza solo.

**Requisitos del feed (a cuidar):** cada producto con `id` único, `price` con moneda
(CLP), `availability` (in stock/out of stock según D1), `image_link` válido,
`link` a la PDP, y un identificador (`gtin`/`mpn` o `brand`; si no hay, `identifier
exists = no`). Respetar políticas de Google (imágenes, títulos).

**Complejidad:** 🟢 bajo. Es de las de **mayor ROI/costo** — habilita pauta en
Google/Meta casi gratis.

## 5. Búsqueda con autocompletado

El catálogo completo ya está en el navegador (via `/api/catalog`, cacheado) → la
búsqueda es un **filtro client-side sobre la lista en memoria**: instantáneo, sin
backend, sin costo.

**Diseño:**
- Caja de búsqueda en el nav (inyectada por el engine) con **dropdown de
  autocompletado** que muestra productos al tipear (match por nombre, categoría, y
  opcional descripción), normalizando tildes (ya hay `normalize`).
- Página de resultados **`buscar.html?q=`** que renderiza la grilla filtrada.
- Ranking simple: match en nombre > en categoría > en descripción.

**Complejidad:** 🟢 bajo. Se apoya en `PRODUCTS` que `storefront.js` ya tiene.

## 6. Cupones / códigos de descuento

Must-have real. **Diseño híbrido (consistente con el modelo de stock):**
- **Definiciones en Contentful** (content type `coupon`): el operador no técnico crea
  códigos sin tocar código — `code, tipo (percent/fixed), valor, monto_mínimo,
  usos_máx, vence, activo, ámbito (todo/categoría/producto)`.
- **Uso/límites en D1** (tabla `coupon_usage`): incremento **atómico** del contador
  de usos (igual que la reserva de stock: `UPDATE … WHERE used < max`), para que un
  código de N usos no se pase.

**Validación:** en `/api/checkout`, si viene un código, se valida **server-side**
(existe, activo, vigente, cumple mínimo, quedan usos) y se aplica el descuento al
**amount ANTES** de cobrar en Flow. El navegador **nunca** fija el descuento.

**Frontend:** input "código de descuento" en el checkout → recalcula el total
(cotización server-side, como ya haces con el envío).

**Decisiones abiertas:**
- ¿Uso único por cliente? Difícil sin cuentas; se puede aproximar por email.
- ¿Cupón de **envío gratis**? (variante del tipo).
- Prohibir apilar cupones.

**Complejidad:** 🟡 medio (nueva tabla D1 + lógica en checkout + admin/Contentful para
crearlos). El límite atómico de usos es lo que hay que hacer con cuidado.

---

## Dependencias nuevas que introduce la v1 (por cliente)

| Feature | Dependencia por cliente |
|---|---|
| Email (Resend) | Cuenta Resend + API key + **DNS de dominio** (SPF/DKIM/DMARC) |
| Analítica | Token de Cloudflare Web Analytics |
| Feed Google/Meta | Cuenta Google Merchant Center / Meta Commerce Manager (las crea el cliente) |
| Cupones | (ninguna externa; content type + tabla D1) |
| SEO+ / Búsqueda | (ninguna externa) |

## Estado de construcción (al 2026-08-01)

| # | Feature | Estado | Dónde |
|---|---|---|---|
| 1 | Búsqueda + autocompletado | ✅ **hecho** (en prod) | `js/storefront.js` (overlay) + `buscar.html` |
| 2 | Feed Google/Meta | ✅ **hecho** (en prod) | `functions/feed.xml.js` + `image_url` en `_lib/catalog.js` |
| 3 | SEO+ (OG/Twitter/canonical/breadcrumb) | ✅ **hecho** (en prod) | `functions/_middleware.js` (HTMLRewriter) |
| 4 | **Cupones / códigos de descuento** | ⬜ **pendiente** | Contentful (defs) + D1 (usos atómicos) + `/api/checkout` |
| 5 | **Email transaccional** (Resend) | ⬜ **pendiente** | confirmación/estado/tracking; luego campañas acotadas |
| 6 | **Analítica** (CF Web Analytics + dashboard) | ⬜ **pendiente** | beacon en el engine + página nueva admin (KV+D1, skill `dataviz`) |

**Extras hechos este ciclo** (base de páginas): 6 legales de Chile + FAQ + `carrito.html`,
footer con enlaces legales, rename `bq-v5.js`→`storefront.js`. Ver `ARCHITECTURE.md §19`.

**Falta / próximos pasos generales:**
- Rellenar placeholders legales `[…]` con datos reales + revisión legal.
- Paginar el catálogo (`limit=100`) para soportar >100 productos.
- **Extraer el repo plantilla** y neutralizar identificadores heredados (`bq-*`,
  `SHOP_CONFIG`, `x-bq-cache`, `bq_cart_v5`) + wiring del token loader en runtime.
- (Opcional CSS) `css/bq-v5.css` → `theme.css`, análogo al rename del JS.

> Todas las features se construyen en el **repo plantilla** (una vez, toda la flota).
> Lo por-cliente son solo las llaves/cuentas de la tabla de dependencias.
