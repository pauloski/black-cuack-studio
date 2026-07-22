/* Tarifas de "Retiro en Punto Blue" (Blue Express) por ZONA de destino.

   Blue Express no expone un API abierto, así que el retiro en punto se cobra con
   esta TABLA que define BlackQuack (cotizando en app.bluex.cl). Como los productos
   son chicos (talla XS/S), el precio depende sobre todo de la ZONA de destino.

   ⚠️ VALORES DE EJEMPLO — reemplazar por los reales cotizados en app.bluex.cl. */

import { lookupComuna, normalize } from './comunas.js';

// Precio (CLP) del retiro en punto por zona, relativo al origen (Quilpué).
export const BLUE_RATES = {
  local:   2900,  // Valparaíso + RM (cerca del origen)
  centro:  3900,  // O'Higgins, Maule, Ñuble, Coquimbo
  sur:     4900,  // Biobío, Araucanía, Los Ríos, Los Lagos
  norte:   4900,  // Atacama, Antofagasta
  extremo: 6900,  // Arica, Tarapacá, Aysén, Magallanes
};

/* Zona de una región de destino (robusto a tildes/nombres largos). */
export function blueZone(region) {
  const r = normalize(region);
  if (r.includes('valparaiso') || r.includes('metropolitana')) return 'local';
  if (r.includes('libertador') || r.includes('ohiggins') || r.includes('maule') || r.includes('nuble') || r.includes('coquimbo')) return 'centro';
  if (r.includes('biobio') || r.includes('araucania') || r.includes('rios') || r.includes('lagos')) return 'sur';
  if (r.includes('atacama') || r.includes('antofagasta')) return 'norte';
  if (r.includes('arica') || r.includes('tarapaca') || r.includes('aisen') || r.includes('aysen') || r.includes('magallanes')) return 'extremo';
  return 'centro'; // fallback
}

/* Costo del retiro en Punto Blue para una comuna. Devuelve
   { ok:true, costo, zona } o { ok:false, error }. */
export function bluePickupRate(comuna) {
  const found = lookupComuna(comuna);
  if (!found) return { ok: false, error: 'Selecciona una comuna válida.' };
  const zona = blueZone(found.region);
  return { ok: true, costo: BLUE_RATES[zona], zona };
}
