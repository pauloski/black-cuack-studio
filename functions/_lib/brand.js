/* BlackQuack — configuración de marca (BACKEND / Pages Functions).

   Fuente de verdad de las constantes de marca que usa la lógica del edge.
   Pensado para el modelo "llave en mano": al forkear para otro cliente, cambiar
   los valores de aquí NO obliga a tocar la lógica transaccional.

   Los tres puntos de marca del proyecto viven en runtimes separados (no hay build
   step que los una), así que al forkear se ajustan en paralelo:
     1. BACKEND   → este archivo (prefijo de orden, nombre para asuntos/logs).
     2. FRONTEND  → js/config.js  (window.BQ_CONFIG.BRAND: nombre, email, redes).
     3. COLORES   → css/bq-v5.css (:root: --color-brand, --color-accent, …).
   Mantener los tres alineados. */

export const BRAND = {
  // Nombre público de la tienda (asuntos de correo, logs).
  name: 'BlackQuack',

  // Prefijo del número de orden (commerceOrder). Cambiarlo a 'ORD-' u otro NO
  // rompe nada: tanto la generación como las validaciones leen de aquí.
  // (Un fork empieza sin órdenes; para una tienda en marcha, cambiar el prefijo
  // invalidaría los códigos ya emitidos, por eso BlackQuack conserva 'BQ-'.)
  orderPrefix: 'BQ-'
};

/* Escapa caracteres especiales de regex por si el prefijo los contiene. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Validación del número de orden, derivada del prefijo de marca.
   Sufijo [A-Z0-9]{4,}: los códigos son <prefijo> + 8 hex en mayúsculas. */
export const ORDER_CODE_RE = new RegExp('^' + escapeRe(BRAND.orderPrefix) + '[A-Z0-9]{4,}$');

/* Genera un número de orden único e impredecible con el prefijo de marca. */
export function newOrderCode() {
  return BRAND.orderPrefix + crypto.randomUUID().split('-')[0].toUpperCase();
}
