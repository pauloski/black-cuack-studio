# BlackQuack — Plan de integración Chilexpress

> Documento de diseño para desarrolladores humanos y otras IA.
> Plan para pasar del despacho **"Por Pagar"** a **cotizar y cobrar el envío en el
> checkout** (domicilio y sucursal) + **seguimiento** con estado propio "en preparación".

**Estado:** planificación. **Creado:** 20 julio 2026.
**Requisito bloqueante para producción:** cuenta comercial Chilexpress con TCC (en trámite).

---

## 1. Decisiones tomadas

| Decisión | Elección | Implicancia |
|---|---|---|
| Cuenta comercial Chilexpress | **Hay que abrirla** (en trámite) | La fase con API real (OT/etiqueta/tracking) espera al TCC; el MVP NO la necesita. |
| Granularidad de peso | **Un peso por producto** | Campo único `peso_gramos` en Contentful + caja por defecto; no por variante. |
| **Cómo se cotiza (Fase 1)** | **API Cotizador en vivo (SIN cuenta comercial)** | Ya suscritos al Cotizador; se cotiza a domicilio en tiempo real. Tabla estática queda solo como **fallback** si la API falla. |
| Servicio a cobrar | **El más barato** que devuelva la API | Se toma la opción de menor `serviceValue` de `courierServiceOptions`. |
| Sucursal | **Diferida a la fase con cuenta comercial** | El Cotizador NO da precio separado de retiro en sucursal (eso se define al crear la OT). Fase 1 = solo domicilio. |

**Principio de diseño clave:** "cotizar" es una **cajita negra** `(comuna, peso) → costo`.
En Fase 1 llama a la API del Cotizador y toma la opción más barata; si la API falla, cae a una
tabla estática (fallback). Todo el resto del checkout (línea de envío, desglose, suma a Flow) no
depende de la fuente del precio → cambiar/ampliar la cotización no toca el checkout.

---

## 2. El bloqueador (leer primero)

Las piezas del proyecto NO están al mismo alcance:

| Pieza | Requisito | Disponibilidad |
|---|---|---|
| Cotizar (rating) | Registro en portal developers (gratis) | **Inmediata (QA)** |
| Cobertura + oficinas | Registro en portal | **Inmediata (QA)** |
| Crear OT + etiqueta + tracking | **Cuenta comercial + TCC + 10 OT de prueba aprobadas (~24 h)** | **Bloqueada hasta tener TCC** |

**Acción en paralelo (no técnica, arrancar ya):** iniciar la cuenta comercial con
Chilexpress (razón social, RUT, TCC) escribiendo a `soporteintegraciones@chilexpress.cl`.
Es lo que más demora y no depende del código.

---

## 3. API de Chilexpress — referencia

**Auth:** Azure API Management. Header `Ocp-Apim-Subscription-Key: <Primary Key>` +
`Content-Type: application/json`. **Cada API tiene su propia key** (Cotizador,
Cobertura, Envíos → 3 suscripciones, 3 keys).

**Hosts:** QA `https://testservices.wschilexpress.com` · PROD `https://services.wschilexpress.com`

| Función | Método | Path (anteponer host) | Estado |
|---|---|---|---|
| Cotizar envío | POST | `/rating/api/v1.0/rates/courier` | Confirmado |
| Regiones | GET | `/georeference/api/v1.0/regions` | Confirmado |
| Comunas + `countyCode` | GET | `/georeference/api/v1.0/coverage-areas?RegionCode={cod}&type=1` | Confirmado (`type`: 0=todas·1=comunas·2=sectores) |
| Oficinas de entrega (sucursales) | GET | `/georeference/api/v1.0/offices?Type={t}&RegionCode={r}&CountyName={c}` | Confirmado (`Type`: 0=todo·1=sucursales·4=Pick Up) |
| Oficinas cercanas | GET | `/georeference/api/v1.0/nearby-offices/{addressId}?Type=&radius=` | Confirmado |
| Georreferenciar dirección | POST | `/georeference/api/v1.0/addresses/georeference` | Confirmado (→ addressId, lat, lng) |
| Crear OT | POST | `/transport-orders/api/v1.0/transport-orders` | Confirmado (host) |
| Tracking | GET | bajo `/transport-orders/api/v1.0/...` (path exacto **por confirmar**) | Por confirmar |

**Coberturas — respuestas confirmadas:** `regions[]` = `{ regionId:"R1", regionName, ineRegionCode }`;
`coverageAreas[]` = `{ countyCode:"BULN", countyName:"BULNES", regionCode, ineCountyCode, coverageName }`;
`offices[]` = `{ officeName, countyName, streetName, streetNumber, address, officeCode, ... }` (para Fase 2).

**Cotizador — request confirmado:**
```json
{
  "originCountyCode": "PUDA",
  "destinationCountyCode": "STGO",
  "package": { "weight": "1", "height": "10", "width": "10", "length": "10" },
  "productType": 3,
  "contentType": 1,
  "declaredWorth": 0,
  "deliveryTime": 0
}
```
- `originCountyCode`/`destinationCountyCode`: código de cobertura de 4 letras (de API Cobertura).
- `deliveryTime`: `0`=todos · `1`=prioritarios · `2`=no prioritarios · `3`=devolución.
- `productType`: `1`=Documento · `3`=Encomienda.

**Respuesta 200 confirmada en el portal:**
```json
{
  "data": { "courierServiceOptions": [
    { "serviceTypeCode": 2, "serviceDescription": "PRIORITARIO", "didUseVolumetricWeight": false,
      "finalWeight": "16.00", "serviceValue": "9306", "conditions": "", "deliveryType": 0, "additionalServices": [] },
    { "serviceTypeCode": 3, "serviceDescription": "EXPRESS", "serviceValue": "6204", "finalWeight": "16.00", ... }
  ] },
  "statusCode": 0, "statusDescription": "OK", "errors": null
}
```
- `serviceValue` = costo del envío en CLP (string). Fase 1 toma el **menor**.
- `serviceTypeCode`: `2`=PRIORITARIO (PREX) · `3`=EXPRESS (CHEX) · `4`=EXTENDIDO (XTEN) · `5`=EXTREMOS (XTRE) · `41`/`42`=Enc. grandes.
- `didUseVolumetricWeight`/`finalWeight`: Chilexpress calcula el peso volumétrico y cobra por el mayor; nosotros solo enviamos peso + dimensiones reales.
- Implementado en `functions/_lib/chilexpress.js` (`quoteShipping()`).
- **Domicilio vs sucursal NO se distingue en el cotizador.** Se define al crear la OT
  con `deliveryOnCommercialOffice` (`true`=oficina/sucursal, `false`=domicilio) +
  `commercialOfficeId` (código de oficina, de "Oficinas de entrega").

**Por confirmar en el "Try it" del portal (con key QA):** fórmula/divisor del peso
volumétrico, nombres de campos de `courierServiceOptions`, path y estados del tracking,
path de "Oficinas de entrega", nombres JSON completos del body de la OT.

**Credenciales de prueba:** TCC `18578680`, RUT marketplace `96756430`.

---

## 4. Cambios de datos

### 4.1 Contentful (content type `product`)
- **Nuevo campo `peso_gramos`** (Integer) — obligatorio para cotizar. Productos sin
  peso → no cotizables (mismo criterio que hoy con `stock` null).
- Caja por defecto en constante del servidor (ej. 30×25×10 cm); dimensiones por producto
  quedan como mejora futura, no MVP.

### 4.2 Nuevo: mapeo comuna → `countyCode` y comuna de origen
- Bajar una vez `coverage-areas` por región y generar `functions/_lib/chilexpress-coverage.js`
  (comuna canónica → `countyCode`). Cachear; regenerar solo si Chilexpress cambia cobertura.
- Constante `ORIGIN_COUNTY_CODE` = comuna desde donde despacha BlackQuack.
- La comuna del checkout ya se valida contra `comunas.js`; se agrega la traducción a `countyCode`.

### 4.3 Orden en KV (`order:<token>`) — campos nuevos
```jsonc
{
  // ...existentes (commerceOrder, email, amount, lines, status, stock_state)...
  "shipping": {
    // ...existentes (nombre, rut, telefono, comuna, region)...
    "metodo": "domicilio | sucursal",
    "costo": 3990,                       // costo del envío cotizado (CLP)
    "servicio": "CHEX",                  // código de servicio elegido
    "oficina": { "id": "...", "nombre": "...", "direccion": "..." }, // solo si sucursal
    "direccion": "..."                   // solo si domicilio
  },
  "amount_products": 13990,              // desglose: productos
  "amount_shipping": 3990,               // desglose: envío
  "amount": 17980,                       // total cobrado por Flow
  "fulfillment": "en_preparacion",       // ver máquina §6
  "tracking": { "ot": null, "eventos": [], "ultimo": null } // se llena en Fase 3
}
```

### 4.4 Variables de entorno (Cloudflare)
- `CHX_RATING_KEY`, `CHX_COVERAGE_KEY`, `CHX_SHIPPING_KEY` (Secrets; QA en Preview, prod en Production).
- `CHX_SANDBOX` (`"1"` QA / `"0"` prod), mismo criterio que `FLOW_SANDBOX`.
- `CHX_TCC` (Secret, Fase 3) — Tarjeta Cliente Chilexpress.

---

## 5. Flujo de checkout nuevo

1. El cliente elige **domicilio** o **sucursal** en el modal de despacho.
2. Al tener comuna (y oficina, si es sucursal), el frontend pide cotización a un nuevo
   endpoint `POST /api/shipping/quote` → `{ metodo, comuna, items }`.
3. El backend calcula peso total (suma de `peso_gramos` × qty) + caja por defecto, traduce
   comuna→`countyCode`, llama al cotizador de Chilexpress y devuelve el/los costo(s).
4. Se muestra el costo y el **total = productos + envío**.
5. Al confirmar, `POST /api/checkout` **recotiza server-side** (nunca confía en el costo del
   browser, mismo principio que el precio), suma el envío al `amount` de Flow y guarda el
   desglose en KV.
6. Sucursal: `GET /api/shipping/offices?comuna=...` lista las oficinas Chilexpress para el selector.

**Seguridad:** el costo de envío se recalcula en el servidor igual que el precio de los
productos. El browser solo envía la modalidad y (si aplica) el id de oficina.

---

## 6. Máquina de fulfillment (con "en preparación")

Estado **separado** del estado de pago (`status`). El de pago sigue igual
(`pending→paid/rejected/...`). El de despacho es nuevo:

```
pagado ──▶ en_preparacion ──▶ despachado ──▶ en_transito ──▶ en_reparto ──▶ entregado
           │ producto en          │ se crea la OT           └──── vienen del tracking ────┘
           │ poder de BlackQuack,  │ (Fase 3): hay N° de
           │ aún no en Chilexpress │ seguimiento + etiqueta
```

- `pagado → en_preparacion`: automático al confirmar el pago (webhook `confirm`).
- `en_preparacion → despachado`: **acción manual en admin** ("marcar despachado") que crea
  la OT en Chilexpress, guarda `tracking.ot` y la etiqueta PDF. **(Fase 3, requiere TCC.)**
- Estados siguientes: se sincronizan desde el tracking de Chilexpress. Como la API devuelve
  **descripciones de texto, no un enum estable**, se guarda el último evento (`tracking.ultimo`)
  y el historial (`tracking.eventos[]`); no se codifica un enum rígido.

### 6.1 Estimación de entrega (preparación + tránsito)

Tiempo de entrega = **preparación** (días hábiles nuestros) + **tránsito** (estimado por zona):

- **Preparación:** `HANDLING_DAYS = 2` días hábiles (constante en `functions/_lib/delivery-estimate.js`),
  con hora de corte `CUTOFF_HOUR = 14` y feriados chilenos (`FERIADOS`, actualizar anualmente).
  Ej: compra sábado → en Chilexpress el martes.
- **Tránsito:** el Cotizador NO da días confiables → se estima por **región** (`transitDays`),
  rango `[min, max]` conservador relativo al origen (Quilpué). Se reemplaza por fechas reales
  cuando exista la OT (fase con cuenta comercial).
- **`estimateDelivery(comuna)`** devuelve la ventana `{ desde, hasta, labels }`. La usan
  `/api/shipping/quote` (mostrar "llega entre X e Y" en el checkout) y `/api/checkout`
  (guardar `entrega` en la orden). Todo en hora de Chile vía `Intl` (`America/Santiago`).

**Etapas de implementación del fulfillment:**
- **Etapa A — Estimación de entrega (HECHA):** `delivery-estimate.js`, quote devuelve `entrega`,
  checkout la guarda + `fulfillment:'pagado'`, y el stepper muestra la ventana en el paso Envío
  y el resumen.
- **Etapa B — Estados + seguimiento (HECHA):**
  - Campo `fulfillment` con transiciones: checkout → `pendiente_pago`; webhook `confirm` (y sweep
    de respaldo) → `en_preparacion` al pagar; admin → `despachado` (+ N° seguimiento) → `entregado`.
  - `_lib/fulfillment.js` (estados, labels, `trackingUrl`, `publicOrderView`), `_lib/admin-auth.js`
    (`requireAdmin`, x-admin-secret).
  - Endpoints: `GET /api/order/status?order=BQ-…` (público, sin datos personales),
    `GET /api/admin/orders` (lista pagadas), `POST /api/admin/dispatch` (avanza estado + tracking).
  - Índice `ordercode:<commerceOrder> → token` escrito en el checkout (para buscar por N° de orden).
  - Páginas: `seguimiento.html` + `js/seguimiento.js` (barra de progreso + N° + link a Chilexpress),
    panel "Pedidos y despacho" en `admin.html`, botón "Seguir mi pedido" en `gracias.html`.
  - PENDIENTE (opcional/fase siguiente): emails de estado; tracking automático (en_transito/entregado)
    requiere la API de tracking de Chilexpress (cuenta comercial). Verificar el deep-link de `trackingUrl`.

---

## 7. Plan por fases

- **Fase 1 — Cotización a domicilio EN VIVO (API Cotizador).** No requiere cuenta comercial.
  - Suscripción a **Cotizador** (hecha) y a **Cobertura** (pendiente) en el portal developers → 2 keys.
  - `functions/_lib/chilexpress.js` (hecho): `quoteShipping()` llama al Cotizador y toma el servicio más barato.
  - `functions/_lib/chilexpress-coverage.js`: mapa **comuna canónica → countyCode** (4 letras), generado
    una vez desde la API Cobertura con `scripts/fetch-chilexpress-coverage.mjs`. `ORIGIN_COUNTY_CODE` = comuna de despacho.
  - `peso_gramos` en Contentful por producto (obligatorio para cotizar) + caja por defecto (`DEFAULT_BOX`).
  - `POST /api/shipping/quote`: `(comuna, items) → { costo, servicio }`. Suma pesos, mapea comuna→código, cotiza.
  - Modal: costo de envío mostrado; recotización server-side en `/api/checkout`; envío sumado al `amount`
    de Flow; desglose (`amount_products`/`amount_shipping`) en KV.
  - Fallback: si el Cotizador falla, tarifa plana de respaldo (para no romper el checkout).
  - Tracking MVP: en admin, marcar "despachado" + pegar a mano el N° de seguimiento → link al tracking
    público. Estados de fulfillment (§6) manuales.
- **Fase 2 — Sucursal + envío real + tracking automático (requiere cuenta comercial + TCC).**
  Precio real de retiro en sucursal (`deliveryOnCommercialOffice` al crear la OT) + `GET /api/shipping/offices`
  (selector de oficina), crear OT desde admin, etiqueta PDF, y sincronización de estados desde el tracking
  de Chilexpress. *En paralelo (no técnico): iniciar cuenta comercial + TCC.*

---

## 8. Riesgos / notas

- **Tarifa cotizada ≠ facturada:** el cotizador no aplica descuentos negociados; el costo real
  puede diferir. Definir si se cobra la tarifa lista o con margen/ajuste.
- **Peso volumétrico:** Chilexpress cobra por el mayor entre peso físico y volumétrico. Enviar
  dimensiones reales (caja por defecto) y usar el valor que devuelve el cotizador, no calcularlo a mano.
- **Un solo bulto por orden:** el carrito se cotiza/despacha como un paquete (peso sumado). Simplifica;
  revisar si algún producto grande obliga a multi-bulto más adelante.
- **`_lib/chilexpress.js`** debe poder correr también desde el Worker si en el futuro se quiere
  sincronizar tracking por cron (mismo patrón que `sweep-core.js`).
