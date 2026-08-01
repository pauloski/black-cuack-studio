# Producto llave en mano — Ecommerce headless para emprendedores

> Documento **de operador** (no debe viajar en el fork de cada cliente).
> Explica qué es el producto, el modelo de entrega, el sistema de diseño por
> tokens y la estrategia de mantenimiento de la flota. La referencia técnica del
> motor vive en `ARCHITECTURE.md` (la implementación de referencia, probada en producción).

## 1. Qué es

Un **ecommerce headless JAMstack + serverless** que se entrega **llave en mano** a
cada cliente, replicando una arquitectura ya probada en producción. No es un SaaS con
suscripción: es un **activo que el cliente posee**.

Tres pilares (para la venta):
1. **JAMstack** — el sitio es HTML/JS/CSS estático servido desde el edge de
   Cloudflare (rápido, barato, difícil de hackear: no hay servidor que vulnerar).
2. **Headless CMS** — el catálogo se administra desde Contentful, sin tocar código.
3. **Serverless** — la lógica transaccional (pago, stock, despacho) corre en
   Functions del edge, sin servidores que mantener.

## 2. El modelo de entrega: una arquitectura ÚNICA por cliente

**Cada cliente recibe una instalación completa e independiente**, centralizada en
**sus propias cuentas**:

- Se crea un **correo nuevo** para el cliente y con él se abren **su Contentful**
  (Free) y **su Cloudflare** (Free). Se conecta **su Flow** y **su dominio**.
- Se despliega el proyecto y **se le entrega la propiedad** (correo + claves).
- **No es multi-tenant.** No hay base de datos compartida ni `tenant_id`: cada
  tienda vive aislada en la cuenta de su dueño. Esto es más **seguro** (cero fuga
  entre clientes) y más **limpio legalmente** (el cliente es dueño de todo).

Consecuencia económica clave: **cada cliente cabe entero en los planes gratuitos**
(su propia cuota de 50 GB + 100K llamadas Contentful, y Cloudflare Free completo).
El blindaje de cuotas (edge-cache de catálogo y widget, ver `ARCHITECTURE.md §18`)
es lo que hace que esto sea **sostenible en Free por cliente**, incluso con tráfico.

> **Guardrail legal:** una cuenta Free por cada cliente **real y distinto** es
> legítimo. La línea que no se cruza: crear cuentas Free que el operador controla
> para multiplicarse cuota. Como la cuenta se **transfiere al cliente** (dueño
> real), estamos del lado correcto. Transferir propiedad de verdad al cerrar.

## 3. Sistema de diseño: `brand.tokens.json` → comando de compilación

Todo lo que cambia entre clientes (marca, logo, colores, tipografías, layout) vive
en **un solo archivo**: `brand.tokens.json`. **Sin compiladores, sin npm, sin
bundlers.** Dos formas de aplicarlo, ambas livianas:

**Recomendada — runtime (cero build, cero comando):** un `<script>` chico (vanilla
JS, ~40 líneas) lee `brand.tokens.json` en el navegador y aplica los valores a las
variables CSS de `:root` y a los textos de marca. El CSS trae defaults en `:root`,
así que el token solo los sobreescribe (sin parpadeo, con degradación elegante).
Editas el JSON → recargas → todo cambia. **`ds.html`** (el design system vivo) lo
demuestra.

**Alternativa — convertidor de 1 comando (JS puro, sin dependencias):**
`node build-tokens.mjs` lee el JSON y escribe archivos estáticos. No es un
"compilador" pesado: es un archivo JS plano corrido con un comando. Ventaja: salida
estática, máximo rendimiento (sin lectura en runtime).

Mapeo `brand.tokens.json` → variables CSS (igual en ambas): `colors.brand`→
`--color-brand`, `colors.accent`→`--color-accent`, `colors.dark`→`--color-dark`,
`colors.bg`→`--bg-primary`, `colors.surfaceSoft`→`--surface-soft`, `colors.error`→
`--color-error`, `fonts.*`→`--font-*`, `layout.radius`→`--border-radius`,
`layout.maxWidth`→`--maxw`.

- **Cambiar logo/colores/layout de un cliente = editar `brand.tokens.json`** (+ el
  logo en `/media`). Un solo lugar; con runtime, ni siquiera un comando.
- El **backend** (prefijo de orden) lee el mismo `brand.tokens.json` (la Function lo
  importa/lee) → una sola fuente de verdad para toda la marca.

Esquema de `brand.tokens.json` (ver `PROMPT-NUEVO-CLIENTE.md` para el detalle):

```json
{
  "brand":  { "name","tagline","email","domain","orderPrefix","logo","socials" },
  "colors": { "brand","accent","dark","bg","surfaceSoft","error" },
  "fonts":  { "title","body","display","mono" },
  "layout": { "radius","maxWidth" }
}
```

Los valores por defecto de la plantilla son: brand `#F39200`, accent `#DEC520`,
dark `#444444`; fuentes Space Grotesk / Plus Jakarta Sans / Archivo Black / Space
Mono; radius `14px`, maxWidth `1280px`. (Son solo defaults; se cambian por cliente.)

## 4. Flujo de páginas (fácil de mapear — HTML5 vanilla)

El sitio es un set plano de páginas HTML; **el flujo ES la estructura de archivos**:

| Página | Rol |
|---|---|
| `index.html` | Home / landing |
| `tienda.html` | Grilla de catálogo |
| `producto.html` / `flipbook.html` | Ficha de producto (PDP) |
| `checkout.html` | Checkout con stepper (datos, despacho, pago) |
| `gracias.html` | Post-pago |
| `seguimiento.html` | Tracking de la orden |
| `contacto.html` · `nosotros.html` · `talleres.html` · `labs.html` | Institucionales |
| `admin.html` · `contentful-stock.html` | Operación (no públicas) |
| `404.html` | Error de marca |

Datos vía el JS de datos (catálogo cacheado en el edge) y `functions/api/*`
(checkout, stock, despacho, pago). Estilos por variables CSS del engine.

## 5. Estrategia de repositorio: plantilla + `upstream` (no submódulos)

**Recomendado: GitHub Template Repository + remote `upstream` + separación piel/núcleo.**

- El **motor** (`functions/`, el JS del engine, el CSS del engine) es idéntico entre
  clientes y **nadie lo toca por cliente**.
- La **piel** (`brand.tokens.json`, `/media/logo*`, contenido en Contentful) es lo
  único que cambia por cliente.
- Cada repo de cliente nace de la **plantilla** y agrega la plantilla como
  `upstream`. Actualizar el motor de un cliente = `git fetch upstream && git merge
  upstream/main`. Como piel y núcleo están en archivos separados, los merges casi
  nunca chocan.

**Por qué NO submódulos:** el build de Cloudflare Pages tendría que `git submodule
update --init` (fricción + punto de falla); complica el traspaso a un cliente no
técnico; y la separación piel/núcleo por archivos ya logra la reutilización sin esa
complejidad. Cada repo de cliente queda **autocontenido** (mejor para que el cliente
sea dueño de un repo completo, no de uno con dependencias externas). Los submódulos
convendrían solo si el núcleo fuera una librería pesada compartida y quisieras
pinnear por ref — no es el caso.

> **Neutralidad de marca del motor (tarea de extracción de la plantilla):** la
> implementación de referencia trae identificadores heredados con prefijo propio
> (nombres de archivo, variables globales y headers tipo `*-config`, `*-cache`,
> `theme.css`). Al extraer la plantilla, **se renombran a neutrales** para que
> ningún cliente arrastre la marca de otro. Esta neutralización se hace en el **repo
> de la plantilla**, no mutando la instalación de referencia en producción.

## 6. Versionamiento y mantenimiento de la flota

- La plantilla lleva un archivo `VERSION` y **tags de git** (`v1.0.0`, …). Cada
  repo de cliente registra de qué versión del motor viene.
- **Actualizar la flota** = script `fleet-update` que, por cada repo de cliente:
  `git fetch upstream` → `git merge upstream/main` → `git push` → Cloudflare Pages
  redepliega solo (los tokens se aplican en runtime; nada que recompilar).
  Loguear qué cliente quedó en qué versión.
- **Acceso de mantenimiento:** como los clientes son no técnicos, el operador
  **retiene** (con consentimiento) un token de deploy / acceso al repo durante el
  contrato de soporte. Sin eso, no se puede parchear una instalación "cerrada".
- **Modelo de contenido de Contentful:** los cambios al content model se aplican
  por espacio con migraciones (`contentful-cli migrations`), no a mano.
- **Secretos por cliente:** cada instalación tiene sus propias llaves (Flow,
  `ADMIN_RESYNC_SECRET`, token Contentful, courier). Gestor de contraseñas
  disciplinado; nunca reutilizar secretos entre clientes.

## 7. Posicionamiento comercial

**Nombre del motor (credibilidad técnica):** "Ecommerce headless JAMstack" — úsalo
en la slide de "cómo funciona" y con compradores técnicos. **No** como nombre de
producto (es jerga para un no técnico).

**Nombre de producto (candidatos, elegir uno):**
- **Tienda Soberana** — vende *propiedad* (eres dueño, no arriendas). Recomendado.
- **Núcleo** / **Raíz** — solidez, base propia (guiño a `:root`).
- **Tienda Propia**.
- *(Podría ser un producto/sub-marca de Spotmind — decidir encaje de marca.)*

**La analogía para no técnicos: arrendar vs. ser dueño de tu tienda.**
- *Shopify / Wix / Jumpseller* = **arriendas**: mensualidad para siempre + comisión
  por venta; si te vas, **pierdes tu tienda**. Nunca es tuya.
- *WooCommerce / WordPress* = **casa frágil**: mantenimiento técnico constante; un
  update mal hecho y la tienda se cae.
- **Esto** = **eres dueño**: se construye una vez, es **tuya para siempre**, casi
  **sin costo mensual** (planes gratuitos), **sin comisiones**, con la **misma
  ingeniería que los gigantes** (Falabella/Sodimac) a tu escala.

**El cost-benefit (cifras de la deck):** un pago único (~$1,15M CLP) con ~$0
mensual de infra, frente a Shopify/Woo que **acumulan $1,4–1,6M en 24 meses** de
mensualidades + comisiones **y no son tuyos**. El cruce ocurre ~mes 15–18; de ahí en
adelante es **ahorro puro y un activo propio**.
