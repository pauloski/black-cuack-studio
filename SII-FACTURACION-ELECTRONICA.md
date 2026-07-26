# BlackQuack — Diagnóstico: facturación electrónica SII (SimpleAPI)

> Documento de diagnóstico para auditoría por desarrolladores humanos y por otras IA.
> Evalúa integrar un proveedor SII (SimpleAPI) para emitir DTE por cada venta.
> **NO es una implementación** — es la evaluación de viabilidad y el plan.

**Fecha:** 26 julio 2026 (hora Chile, UTC−04).
**Estado:** diagnóstico aprobado. Decisiones tomadas: **arrancar por boleta
electrónica**; factura electrónica en fase 2. Sin código todavía.
**Fuentes:** sitio de SimpleAPI (`simpleapi.cl`) + estándar SII de DTE. La doc
técnica (colección Postman en `documentacion.simpleapi.cl`) **no cargó** al
momento de escribir esto → el contrato exacto de la API queda **por verificar**.

---

## 1. Decisiones tomadas

- **Caso de uso (opción A):** se emite **factura** cuando el **comprador** es una
  empresa con giro (entrega RUT + razón social + giro + dirección); **boleta** para
  el resto (B2C).
- **Fase 1 = boleta electrónica.** Es el 90% de las ventas B2C, es obligatoria
  desde 2021 y **ya tenemos los datos** que requiere (el checkout captura RUT).
- **Fase 2 = factura electrónica.** Requiere agregar campos condicionales al
  checkout (giro, razón social, dirección del receptor). Fuera de alcance de la
  fase 1.

---

## 2. Por qué SimpleAPI encaja con el stack (el punto clave)

Emitir un DTE exige **firmar XML con el certificado digital** (XML-DSig) y armar el
**timbre electrónico (TED)** — criptografía pesada que **no corre bien en
Cloudflare Workers** (runtime de las Pages Functions: sin Node `crypto` completo ni
librerías de firma XML).

**SimpleAPI hace la firma, el timbraje y la comunicación con el SII server-side.**
Se le mandan los datos + certificado + folios por REST y devuelve el DTE firmado.
Eso **saca del edge justo lo que no se puede hacer ahí** → es el argumento más
fuerte a su favor frente a alternativas self-host (ej. LibreDTE, que exige PHP +
crypto).

- Es **API REST** (también SDK .NET, que no aplica) → llamable con `fetch` desde
  las Functions.
- Ambientes **Certificación** (maullín) y **Producción** (palena).
- Precio: **gratis hasta 500 emisiones/mes**, planes pagados hasta 150.000/mes →
  el volumen actual (~15 productos) cabe holgado en el free tier.

---

## 3. Prerrequisitos tributarios (aquí está el trabajo de verdad)

Para emitir **cualquier** DTE, el **emisor** (el comerciante) necesita:

| Requisito | Detalle | Costo/fricción |
|---|---|---|
| **Inicio de actividades** + ser **emisor electrónico** habilitado en SII | Trámite en SII | — |
| **Certificado digital** (firma electrónica) | Se compra a una certificadora (E-Sign, Acepta, etc.) | ~$15–30k CLP/año |
| **CAF (folios)** por tipo de documento | Se descargan del SII | Gratis |
| **Certificación SII** (set de pruebas / simulación) | Emitir documentos de prueba y que el SII apruebe **antes** de producción | **No trivial**, toma tiempo |

⚠️ **Impacto en el modelo llave-en-mano:** cada cliente del fork necesita **su
propio** certificado + CAF + proceso de certificación. No es "clonar el repo y
listo" — es un **onboarding tributario por tenant** que hay que documentar como
parte del producto.

---

## 4. Brecha de datos: boleta vs factura

| | Boleta electrónica (fase 1) | Factura electrónica (fase 2) |
|---|---|---|
| Cuándo | Default B2C (obligatoria desde 2021) | Solo si el comprador la pide y tiene giro |
| Datos del receptor | Mínimos (RUT opcional) | **RUT + razón social + giro + dirección** |
| ¿El checkout los tiene hoy? | ✅ Sí (ya pide RUT) | ❌ **Faltan** razón social, giro y dirección del receptor |

→ La **boleta** se puede emitir con lo que ya se captura. La **factura** exige
campos condicionales nuevos en el checkout ("¿Necesitas factura?" → despliega
giro/razón social/dirección).

---

## 5. Encaje en el flujo (arquitectura propuesta, fase 1)

- **Punto de emisión:** `functions/api/flow/confirm.js`, cuando `status === PAID`.
  Es el hook natural: pago confirmado → emitir boleta server-side.
- **Idempotencia:** Flow reintenta el webhook. Igual que el `stock_state` actual,
  hace falta un **`dte_state`** (guard) para no emitir dos veces la misma boleta.
  Estados sugeridos: `pending` → `issued` → (`failed` para reintento).
- **Persistencia:** guardar tipo de DTE, folio, y URL/handle del PDF/XML junto a la
  orden en KV; exponer el N° de documento en la página de seguimiento.
- **Secretos:** el `.pfx` + su clave + los CAF van en **Cloudflare Secrets**
  (per-tenant en el fork), **nunca** en el repo. Coincide con la regla de
  `.dev.vars`/Secrets del proyecto.
- **Resiliencia:** si SimpleAPI o el SII fallan, la orden queda en `dte_state =
  failed/pending` y se reintenta (el webhook de Flow o un barrido tipo cron). El
  pago no depende de que la boleta se emita a la primera, pero la boleta **sí**
  debe emitirse (el SII exige emisión al momento de la venta).
- **Detalle por verificar (no se pudo leer la doc Postman):** si SimpleAPI recibe
  el **certificado y CAF en cada request** (multipart) o **pre-configurados**. Eso
  define cómo el Worker guarda/envía esos bytes. **Confirmar antes de diseñar.**

---

## 6. Riesgos / cosas a vigilar

- **Certificación SII** es el hito que más se subestima: plan de proyecto real, no
  una tarde.
- **Timing de la boleta:** el SII exige emitirla en el momento de la venta → la
  emisión en el webhook de pago debe ser confiable (con reintentos).
- **Dependencia de tercero:** si SimpleAPI cae, no se emite. Necesita cola/reintento
  y un estado `pendiente_dte`.
- **Contrato de API no verificado:** la doc Postman no cargó. Antes de comprometer
  diseño hay que leerla (o pedir acceso/soporte a SimpleAPI).

---

## 7. Alternativa a comparar

El competidor REST más directo es **OpenFactura (Haulmer)** — mismo modelo (ellos
firman, tú llamas REST), muy usado en ecommerce chileno y con doc pública más
accesible. Vale compararlos en **precio, límites y facilidad de la doc** antes de
casarse con SimpleAPI. (**LibreDTE** es potente pero self-host → mala idea en el
stack edge.)

---

## 8. Próximos pasos (cuando se implemente)

1. **Verificar el contrato real de SimpleAPI** (auth, endpoints, modelo de
   certificado/CAF) — y comparar de paso con OpenFactura.
2. Conseguir del comerciante: **certificado digital**, **CAF de boleta**, y hacer
   la **certificación SII** en ambiente de prueba (maullín).
3. Diseñar `dte_state` + emisión idempotente en `flow/confirm.js`.
4. Persistir folio/PDF en KV y mostrarlo en seguimiento.
5. **Fase 2:** campos de factura en el checkout + emisión de factura para giros.
6. **Fork:** documentar el onboarding tributario por tenant como parte del
   "llave en mano".
