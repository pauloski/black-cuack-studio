/* Estimación de la fecha de entrega = PREPARACIÓN (días hábiles nuestros) +
   TRÁNSITO (estimado por zona de destino). NO es una promesa exacta: es un rango
   informativo. Cuando exista la OT de Chilexpress, se reemplaza por fechas reales.

   Todo el cálculo es en días hábiles (salta fines de semana y feriados) y en hora
   de Chile (America/Santiago). */

import { lookupComuna, normalize } from './comunas.js';

// Días hábiles que tardamos en preparar y dejar el paquete en Chilexpress.
export const HANDLING_DAYS = 2;

// Hora de corte (0-23, hora Chile): comprar después cuenta desde el próximo hábil.
export const CUTOFF_HOUR = 14;

/* Feriados chilenos (YYYY-MM-DD). Los fijos van sembrados; ACTUALIZAR cada año e
   incluir los MOVIBLES (Viernes Santo, censos, elecciones, etc.) desde feriados.cl.
   Si falta alguno, la estimación se corre a lo más 1 día — es un rango "aprox". */
export const FERIADOS = new Set([
  // 2026
  '2026-01-01', '2026-05-01', '2026-05-21', '2026-06-20', '2026-06-29',
  '2026-07-16', '2026-08-15', '2026-09-18', '2026-09-19', '2026-10-12',
  '2026-10-31', '2026-11-01', '2026-12-08', '2026-12-25',
  // 2027 (fijos; revisar movibles)
  '2027-01-01', '2027-05-01', '2027-05-21', '2027-06-21', '2027-06-29',
  '2027-07-16', '2027-08-15', '2027-09-18', '2027-09-19', '2027-10-12',
  '2027-10-31', '2027-11-01', '2027-12-08', '2027-12-25',
]);

/* Tránsito estimado (días hábiles) por zona de destino, relativo al origen
   (Quilpué / zona central). Rango [min, max], conservador. Ajustar con la
   experiencia real. Se resuelve por región (robusto a nombres con tildes/apóstrofos). */
function transitDays(region) {
  const r = normalize(region);
  if (r.includes('valparaiso')) return [1, 2];
  if (r.includes('metropolitana')) return [1, 2];
  if (r.includes('ohiggins') || r.includes('libertador')) return [2, 3];
  if (r.includes('coquimbo')) return [2, 3];
  if (r.includes('maule')) return [2, 3];
  if (r.includes('nuble')) return [2, 4];
  if (r.includes('biobio')) return [2, 4];
  if (r.includes('araucania')) return [3, 5];
  if (r.includes('rios')) return [3, 5];
  if (r.includes('lagos')) return [4, 6];
  if (r.includes('atacama')) return [3, 4];
  if (r.includes('antofagasta')) return [3, 5];
  if (r.includes('arica')) return [4, 6];
  if (r.includes('tarapaca')) return [4, 6];
  if (r.includes('aisen') || r.includes('aysen')) return [5, 8];
  if (r.includes('magallanes')) return [5, 8];
  return [3, 5]; // fallback conservador
}

// --- helpers de días hábiles (sobre fechas ancladas a medianoche UTC) ----------
function iso(d) { return d.toISOString().slice(0, 10); }
function isBusinessDay(d) {
  const wd = d.getUTCDay();               // 0 = domingo, 6 = sábado
  if (wd === 0 || wd === 6) return false;
  return !FERIADOS.has(iso(d));
}
function addBusinessDays(d, n) {
  let r = d;
  while (n > 0) { r = new Date(r.getTime() + 86400000); if (isBusinessDay(r)) n--; }
  return r;
}

/* "hoy" en hora de Chile → { y, m, d, hour }, sin librerías de TZ. */
function chileNow(now) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(now).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour };
}

function label(d) {
  // d es medianoche UTC que representa una fecha de calendario → formatear en UTC.
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  }).format(d);
}
function shortLabel(d) {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  }).format(d);
}

/* Estima la ventana de entrega para una comuna. `now` = Date (por defecto ahora).
   Devuelve { desde, hasta, desdeLabel, hastaLabel, prepDays, transito } o null si
   la comuna no existe. Las fechas son ISO (YYYY-MM-DD); los labels, en español. */
export function estimateDelivery(comuna, now = new Date()) {
  const found = lookupComuna(comuna);
  if (!found) return null;
  const [tmin, tmax] = transitDays(found.region);

  const { y, m, d, hour } = chileNow(now);
  let base = new Date(Date.UTC(y, m - 1, d));   // medianoche UTC de la fecha chilena
  if (hour >= CUTOFF_HOUR) base = addBusinessDays(base, 1); // pasó el corte

  const drop = addBusinessDays(base, HANDLING_DAYS);        // dejamos en Chilexpress
  const desde = addBusinessDays(drop, tmin);
  const hasta = addBusinessDays(drop, tmax);

  return {
    desde: iso(desde), hasta: iso(hasta),
    desdeLabel: label(desde), hastaLabel: label(hasta),
    desdeShort: shortLabel(desde), hastaShort: shortLabel(hasta),
    prepDays: HANDLING_DAYS, transito: [tmin, tmax],
  };
}
