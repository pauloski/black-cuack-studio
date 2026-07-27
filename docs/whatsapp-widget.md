# WhatsApp — botón flotante configurable desde Contentful

Botón flotante de WhatsApp que **lee su configuración desde Contentful**: número,
mensajes, encendido/apagado y horario (días + horas). Implementado en
`js/whatsapp.js` (autocontenido) e incluido en las páginas públicas.

> **Importante:** el código **no muestra nada** hasta que crees el content type y
> la entrada en Contentful. Es intencional (falla en silencio). Nada que hacer en
> el código para activarlo — se controla 100% desde Contentful.

---

## 1. Crear el content type en Contentful

En Contentful → **Content model** → **Add content type**:

- **Name:** `WhatsApp — Botón flotante`
- **Api Identifier (Content type ID):** `whatsappWidget` ← debe ser exacto

Agrega estos campos. **El "Field ID" debe coincidir exactamente** (el código los
busca por ese nombre):

| Field ID | Tipo en Contentful | Para qué sirve |
|---|---|---|
| `activo` | Boolean | Interruptor maestro: **mostrar / ocultar** el botón en todo el sitio |
| `telefono` | Short text | Número con **código país sin +**, ej. `56912345678` |
| `mensajePredeterminado` | Long text | Texto que se **pre-rellena** en el chat al abrir WhatsApp |
| `saludo` | Short text | Burbuja de saludo sobre el botón (opcional) |
| `diasDisponibles` | Short text, **List** | Días disponibles: `lunes`, `martes`, `miercoles`, `jueves`, `viernes`, `sabado`, `domingo` (acepta con o sin tilde) |
| `horaInicio` | Short text | Inicio del horario, formato `HH:MM`, ej. `09:00` |
| `horaFin` | Short text | Fin del horario, ej. `18:00` |
| `ocultarFueraDeHorario` | Boolean | `true`: el botón **se oculta** fuera de horario · `false`: se **muestra** en gris con `mensajeFueraDeHorario` |
| `mensajeFueraDeHorario` | Long text | Texto alterno cuando está fuera de horario (opcional) |

## 2. Crear la entrada

Content → **Add entry** → `WhatsApp — Botón flotante`. Crea **una sola** entrada
(es un singleton; el código lee la primera). Complétala y **publícala**.

**Ejemplo:**

| Campo | Valor |
|---|---|
| activo | ✅ true |
| telefono | `56912345678` |
| mensajePredeterminado | `¡Hola! Vengo desde la web de BlackQuack y tengo una consulta 🦆` |
| saludo | `¿Dudas con tu pedido? Escríbenos 👋` |
| diasDisponibles | `lunes`, `martes`, `miercoles`, `jueves`, `viernes` |
| horaInicio | `09:00` |
| horaFin | `18:00` |
| ocultarFueraDeHorario | ❌ false |
| mensajeFueraDeHorario | `Estamos fuera de horario, pero déjanos tu mensaje y te respondemos apenas volvamos.` |

---

## 3. Comportamiento

- **Encender/apagar:** `activo = false` → no aparece en ningún lado.
- **Horario:** se evalúa en **hora de Chile** (America/Santiago), no en la del
  visitante. Dentro de horario el botón va en **verde** con un punto "en línea";
  fuera de horario, en **gris** (si `ocultarFueraDeHorario = false`).
- **Sin `diasDisponibles`** → disponible todos los días.
  **Sin `horaInicio`/`horaFin` válidas** → disponible 24 h.
- **Clic:** abre `wa.me/<telefono>` con el mensaje pre-rellenado
  (`mensajeFueraDeHorario` si está fuera de horario y existe).
- **Caché:** la config se cachea 5 min en `sessionStorage` (no refetch en cada
  navegación). Cambios en Contentful se ven al recargar tras expirar la caché.

## 4. Dónde aparece

Incluido en: `index`, `tienda`, `producto`, `contacto`, `nosotros`, `labs`,
`talleres`, `seguimiento`, `gracias`. **No** en `checkout` (para no distraer en el
pago) ni en `admin` (interno). Para agregarlo a otra página, incluir antes de
`</body>`:

```html
<script src="/js/whatsapp.js" defer></script>
```

## 5. Limitaciones conocidas / extensiones futuras

- **Una sola ventana horaria** aplicada a todos los días disponibles. Horarios
  distintos por día (ej. sábado media jornada) requerirían ampliar el modelo.
- **Sin partición horaria de colación** (una sola franja continua inicio→fin).
- El número/token de Contentful (CDA, público read-only) va en `js/config.js` y
  como fallback en `js/whatsapp.js`. Si el token rota, actualizar ambos.
