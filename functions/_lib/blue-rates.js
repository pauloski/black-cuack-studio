/* Tarifas de "Retiro en Punto Blue" (Blue Express) — Programa Emprendedor.

   Blue Express no expone un API abierto, así que el retiro se cobra con esta
   TABLA. Usamos las tarifas del programa "Emprendedor de Regiones" en modalidad
   PUNTO A PUNTO (dejar y retirar en Puntos Blue), que es exactamente nuestro caso
   y el nivel más económico. Requiere estar registrado como comercio en blue.cl.

   El precio depende de dos cosas:
     - TALLA del envío, según el peso del carrito (XS/S/M/L).
     - ZONA de destino, relativa al origen (Quilpué, Región de Valparaíso).

   Origen fijo: Quilpué. Si algún día cambia, cambia el mapa de zonas de blueZone. */

import { lookupComuna, normalize } from './comunas.js';

/* Talla Blue Express según el peso facturable del carrito (kg).
   XS 0–0.5 · S ≤3 · M 3–6 · L 6–16. Sobre 16 kg cae a L (Blue no recibe más en
   este flujo; el checkout no debería llegar ahí con productos chicos). */
export function blueTalla(weightKg) {
  const kg = Number(weightKg) || 0;
  if (kg <= 0.5) return 'XS';
  if (kg <= 3) return 'S';
  if (kg <= 6) return 'M';
  return 'L';
}

/* Zona de destino para el retiro punto-a-punto, desde Quilpué:
     valpo   → misma región (Valparaíso), incluye Marga Marga, Viña, Valpo…
     rm      → Región Metropolitana (Santiago)
     extremo → Arica y Parinacota, Tarapacá, Aysén, Magallanes
     otras   → resto de regiones (interregional estándar) */
export function blueZone(region) {
  const r = normalize(region);
  if (r.includes('valparaiso')) return 'valpo';
  if (r.includes('metropolitana')) return 'rm';
  if (
    r.includes('arica') || r.includes('tarapaca') ||
    r.includes('aisen') || r.includes('aysen') || r.includes('magallanes')
  ) return 'extremo';
  return 'otras';
}

/* Precio (CLP) del retiro punto-a-punto: BLUE_RATES[zona][talla].
   Fuente: programa "Emprendedor de Regiones" (Punto a Punto). */
export const BLUE_RATES = {
  valpo:   { XS: 1900, S: 2900, M: 3900, L: 4800 },   // dentro de la Región de Valparaíso
  rm:      { XS: 2500, S: 3900, M: 4900, L: 7900 },   // Valparaíso → Santiago (RM)
  otras:   { XS: 2900, S: 6900, M: 8500, L: 11500 },  // interregional estándar
  extremo: { XS: 2900, S: 6900, M: 8500, L: 11500 },  // hacia zonas extremas
};

/* Costo del retiro en Punto Blue para una comuna y un peso de carrito.
   Devuelve { ok:true, costo, zona, talla } o { ok:false, error }. */
export function bluePickupRate(comuna, weightKg = 0.5) {
  const found = lookupComuna(comuna);
  if (!found) return { ok: false, error: 'Selecciona una comuna válida.' };
  const zona = blueZone(found.region);
  const talla = blueTalla(weightKg);
  const costo = BLUE_RATES[zona]?.[talla];
  if (costo == null) return { ok: false, error: 'No pudimos calcular la tarifa de retiro.' };
  return { ok: true, costo, zona, talla };
}
