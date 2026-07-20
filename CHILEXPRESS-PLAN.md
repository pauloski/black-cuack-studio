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
| Alcance del MVP | **Domicilio + sucursal juntos** | Ambas modalidades desde el inicio. |
| **Cómo se cotiza en el MVP** | **Tabla de tarifas propia (SIN API)** | El MVP usa una tabla por zona × modalidad que define BlackQuack; la API en vivo llega después SIN rehacer el checkout. |

**Principio de diseño clave:** "cotizar" es una **cajita negra** `(comuna, modalidad, peso) → costo`.
En el MVP mira una tabla estática; más adelante llama a la API de Chilexpress. Todo el resto del
checkout (selector, línea de envío, desglose, suma a Flow) es idéntico en ambos casos → el MVP
**no es trabajo desechable**, es el andamiaje sobre el que se enchufa la API.

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
| Comunas + `countyCode` | GET | `/georeference/api/v1.0/coverage-areas?RegionCode={cod}&type=0` | Confirmado |
| Oficinas de entrega (sucursales) | GET | bajo `/georeference/api/v1.0/...` (path exacto **por confirmar en portal**) | Por confirmar |
| Crear OT | POST | `/transport-orders/api/v1.0/transport-orders` | Confirmado (host) |
| Tracking | GET | bajo `/transport-orders/api/v1.0/...` (path exacto **por confirmar**) | Por confirmar |

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
- Respuesta: opciones en `data.courierServiceOptions[]` (una por servicio disponible).
- Códigos de servicio: `3`=CHEX (Express) · `4`=XTEN (Extendido) · `5`=XTRE (Extremos).
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

---

## 7. Plan por fases

- **Fase 1 — MVP con tabla de tarifas (SIN API Chilexpress).** No requiere keys ni cuenta comercial.
  - `peso_gramos` en Contentful (para armar la tabla y a futuro; el cálculo MVP es por zona).
  - `_lib/shipping-rates.js`: tabla zona × modalidad (domicilio/sucursal) editable por BlackQuack.
    Mapa comuna/región → zona (RM / centrales / extremas).
  - `POST /api/shipping/quote`: cajita negra `(comuna, modalidad) → costo` mirando la tabla.
  - Modal: selector domicilio/sucursal + costo mostrado; recotización server-side en `/api/checkout`;
    envío sumado al `amount` de Flow; desglose (`amount_products`/`amount_shipping`) en KV.
  - Sucursal en MVP: se cobra la tarifa de sucursal y la oficina puntual se coordina a mano
    (o selector simple de comuna); el listado de oficinas vía API es de la fase con API.
  - Tracking MVP: en admin, marcar "despachado" + pegar a mano el N° de seguimiento Chilexpress →
    el cliente ve link al tracking público. Estados de fulfillment (§6) funcionan igual, manuales.

  Ejemplo de tabla (valores a definir por BlackQuack cotizando en chilexpress.cl):
  | Zona | Domicilio | Sucursal |
  |---|---|---|
  | RM | $3.500 | $2.900 |
  | Regiones centrales | $4.900 | $3.900 |
  | Regiones extremas | $7.900 | $5.900 |

- **Fase 2 — Habilitación de la API.** Registro en portal developers, suscripción a las 3 APIs,
  keys QA. Bajar y cachear comuna→`countyCode`. Confirmar en "Try it" los datos pendientes (§3).
  *En paralelo (no técnico): iniciar cuenta comercial + TCC.*
- **Fase 3 — Cotización en vivo.** Reemplazar la tabla por `_lib/chilexpress.js` dentro de la MISMA
  cajita negra `quote()`: cotización real domicilio/sucursal + `GET /api/shipping/offices` (selector
  de oficina). El resto del checkout no cambia.
- **Fase 4 — Envío real + tracking automático (requiere TCC).** Crear OT desde admin, guardar N°
  seguimiento y etiqueta PDF, sincronización de estados desde el tracking de Chilexpress.

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
