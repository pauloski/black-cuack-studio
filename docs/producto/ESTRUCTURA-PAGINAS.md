# Estructura de páginas — base sólida del ecommerce

> Documento **de operador / plantilla**. Set mínimo de páginas para un ecommerce
> completo, confiable y **legalmente correcto en Chile**. HTML5 + vanilla JS + CSS
> variables; URLs limpias (Cloudflare Pages sirve sin `.html`).

## Principio de templating (importante)

No hay un archivo HTML por producto ni por categoría. Son **plantillas únicas**
alimentadas por datos:
- **PLP** (una plantilla) se filtra por query param (`?cat=poleras`) contra el
  catálogo cacheado en el edge.
- **PDP** (una plantilla) se resuelve por `?id=SKU` contra el mismo catálogo.
- El **carrito** vive en `localStorage`; el checkout lo cobra server-side.

## El flujo (funnel) principal

```
Home ─► PLP (categoría/listado) ─► PDP (ficha) ─► Carrito ─► Checkout ─► Pago (Flow)
                                                                 │
                              ┌──────────────────────────────────┤
                              ▼                                  ▼
                     Gracias (pago OK)                   Pago rechazado
                              │
                              ▼
                     Seguimiento de pedido
```

## 1. Comercio (funnel — imprescindibles)

| Página | Archivo | Rol |
|---|---|---|
| **Home** | `index.html` | Portada, destacados, entradas a categorías |
| **PLP / Categorías** | `tienda.html` (`?cat=`) | Listado/grilla filtrable de productos |
| **PDP / Ficha** | `producto.html` (`?id=`) | Detalle, variantes, stock vivo, add-to-cart |
| **Carrito** | `carrito.html` | Resumen editable (además del drawer rápido) |
| **Checkout** | `checkout.html` | Stepper: datos → despacho → pago |
| **Gracias** | `gracias.html` | Confirmación de compra + resumen de orden |
| **Pago rechazado** | `pago-rechazado.html` | Estado de pago fallido/anulado + reintento |
| **Seguimiento** | `seguimiento.html` | Estado y tracking de la orden por código |
| **Búsqueda** | `buscar.html` (`?q=`) | Resultados de búsqueda *(opcional pero recomendado)* |

## 2. Institucional / confianza

| Página | Archivo | Rol |
|---|---|---|
| **Nosotros** | `nosotros.html` | Historia, marca, confianza |
| **Contacto** | `contacto.html` | Formulario / WhatsApp / datos |
| **Preguntas frecuentes** | `preguntas-frecuentes.html` | FAQ (despacho, pagos, cambios) |

## 3. Legales y políticas (Chile — imprescindibles para vender online)

| Página | Archivo | Por qué |
|---|---|---|
| **Términos y condiciones** | `terminos.html` | Contrato de compra; exigible |
| **Política de privacidad** | `privacidad.html` | Datos personales (Ley 19.628 / actualización) |
| **Política de despacho** | `despacho.html` | Plazos, cobertura, costos |
| **Cambios y devoluciones** | `cambios-devoluciones.html` | Garantía legal + derecho a retracto (SERNAC) |
| **Botón de arrepentimiento** | `anulacion.html` | **Obligatorio en Chile** (Ley 21.398): anular compra a distancia |
| **Política de cookies** | `cookies.html` | O integrada en privacidad + banner de cookies |

> Chile: la **garantía legal** y el **derecho a retracto (10 días)** deben estar
> visibles, y el **botón de arrepentimiento** es un requisito legal para contratos
> a distancia. No es opcional para un ecommerce serio.

## 4. Sistema / estados

| Página | Archivo | Rol |
|---|---|---|
| **404** | `404.html` | Ruta inexistente (de marca, rutas absolutas) |
| **Mantenimiento** | `mantenimiento.html` | *(opcional)* aviso temporal |
| `robots.txt` · `sitemap.xml` | — | SEO (sitemap dinámico desde el CMS) |

## 5. Operación (no públicas, `noindex`)

| Página | Archivo | Rol |
|---|---|---|
| **Admin** | `admin.html` | Órdenes, inventario, despacho (protegida por secreto) |
| **App de stock (CMS)** | `contentful-stock.html` | Barra lateral en el CMS para stock vivo |
| **Design System** | `ds.html` | Style guide vivo: renderiza todos los tokens/componentes desde `brand.tokens.json`. Verifica la marca tras cambiar el JSON |

## 6. Opcionales según el cliente

- **Blog / Novedades** (`blog.html` + `articulo.html?slug=`) — SEO y contenido.
- **Landing de campaña** (`landing-*.html`) — para pauta/publicidad.
- **Páginas de contenido libres** (talleres, servicios, etc.) según el rubro.

## Convenciones

- **URLs limpias:** `/producto?id=…`, `/tienda?cat=…` (Pages quita el `.html`).
- **SEO:** cada página con `<title>`/meta propios; PDP con JSON-LD `Product/Offer`;
  `sitemap.xml` generado desde el CMS.
- **Accesibilidad/legal en el footer:** enlaces a las 6 páginas legales visibles en
  todas las páginas (footer compartido).
- **Header/footer compartidos:** inyectados por el JS del engine (un solo lugar),
  para que agregar una página sea trivial.

## Estado vs. plantilla base

- **Ya existen** (implementación de referencia): home, PLP, PDP, checkout, gracias,
  seguimiento, contacto, nosotros, 404, admin, app de stock.
- **A agregar para la base sólida:** `carrito.html`, `pago-rechazado.html`,
  `buscar.html` (opcional), `preguntas-frecuentes.html`, y las **6 legales** del §3
  (`terminos`, `privacidad`, `despacho`, `cambios-devoluciones`, `anulacion`,
  `cookies`). Estas legales son plantillas de texto que se rellenan por cliente.
