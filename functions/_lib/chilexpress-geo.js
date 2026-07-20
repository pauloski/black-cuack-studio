/* Traducción comuna -> countyCode de Chilexpress (lo que exige el Cotizador).

   Los DATOS (mapa comuna→código) se generan en chilexpress-coverage-data.js con
   scripts/fetch-chilexpress-coverage.mjs y NO se editan a mano. Este archivo tiene
   lo que sí se ajusta a mano: la comuna de origen, los aliases de nombres que
   difieren entre nuestra lista y Chilexpress, y la función de búsqueda. */

import { COUNTY_CODES } from './chilexpress-coverage-data.js';

// Comuna de ORIGEN: desde dónde despacha BlackQuack. Se toma del env
// CHX_ORIGIN_COMUNA (NOMBRE de comuna) y se traduce a su countyCode; si falta,
// cae a Quilpué. Así el origen se cambia por variable de entorno, sin tocar código.
const DEFAULT_ORIGIN_COMUNA = 'Quilpué';

export function originCode(env) {
  return countyCodeFor((env && env.CHX_ORIGIN_COMUNA) || DEFAULT_ORIGIN_COMUNA);
}

/* Aliases: comunas cuyo nombre en NUESTRA lista (comunas.js) no calza por nombre
   con el de Chilexpress. clave = comuna nuestra normalizada · valor = countyCode.
   Resueltos con los candidatos reales que reportó el generador. */
export const ALIASES = {
  calera: 'LACA',                  // nuestra "Calera" = "LA CALERA" (Valparaíso)
  llaillay: 'LLAY',                // "LLAY-LLAY"
  coihaique: 'COYH',               // "COYHAIQUE"
  cabodehornosexnavarino: 'CAHO',  // "CABO DE HORNOS"
  santiago: 'STGO',                // "SANTIAGO CENTRO"
  // Sin cobertura Chilexpress (no mapean): San Fabián (Ñuble), O'Higgins (Aysén).
};

// Misma normalización que comunas.js: sin tildes, minúsculas, solo alfanumérico.
function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* Devuelve el countyCode de una comuna, o null si Chilexpress no la cubre. */
export function countyCodeFor(comuna) {
  const n = normalize(comuna);
  return COUNTY_CODES[n] || ALIASES[n] || null;
}
