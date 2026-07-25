/* Puntos Blue Express — fuente de datos + consultas.

   El dataset (2.850 puntos, ~11 MB) se importa como módulo: en Pages Functions
   todo lo que vive bajo functions/ es CÓDIGO, no un asset servible, así que no
   se puede `fetch`. El import es la vía nativa; esbuild lo empaqueta (gzip ~0.4 MB).

   Vive en _lib (el `_` lo excluye del routing) para que la ruta sea delgada y
   esta lógica se reuse luego en el checkout. Nunca sirvas el JSON crudo al
   navegador: son 11 MB. Filtramos y adelgazamos acá. */

import RAW from './puntos.json';

// Normaliza para comparar sin tildes ni mayúsculas ("Ñuñoa" ≈ "nunoa").
const norm = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

/* Proyección mínima que necesita el frontend: mapa, selector y validación.
   Deja fuera checkingAccount y demás campos internos del courier. */
function slim(p) {
  const a = p.address || {};
  const g = a.geolocation || {};
  return {
    id: p.agencyId,
    nombre: p.agencyName,
    tipo: p.typeAgency?.name ?? null,
    recibePaquete: !!p.packageReception,
    permiteRetiro: !!p.pickupAvailability,
    direccion: {
      completa: a.fullAddress ?? null,
      calle: a.streetName ?? null,
      numero: a.streetNumber ?? null,
      comuna: a.commune?.name ?? null,
      comunaId: a.commune?.id ?? null,
      ciudad: a.city?.name ?? null,
      region: a.state?.name ?? null,
      regionId: a.state?.id ?? null,
      zipcode: a.zipcode ?? null,
    },
    lat: g.latitude ?? null,
    lng: g.longitude ?? null,
    maxPaquete: p.maximumPackageDimensions ?? null,
    horarios: p.schedules?.attentions ?? [],
  };
}

/* Se adelgaza UNA vez al iniciar el isolate (no por request). Solo puntos
   activos: los inactivos no deben ofrecerse en el checkout. */
const PUNTOS = RAW.filter((p) => p.status === 'active').map(slim);

// Índice de búsqueda paralelo a PUNTOS, precalculado para no normalizar por request.
const HAYSTACK = PUNTOS.map((p) =>
  norm(`${p.nombre} ${p.direccion.completa} ${p.direccion.comuna}`)
);

export const totalPuntos = () => PUNTOS.length;

// Haversine en km. lat/lng en grados.
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* Consulta unificada. Todos los filtros son opcionales y se combinan (AND).
   opts: { comuna, comunaId, region, regionId, q, lat, lng, tipo, limit }
   Con lat/lng devuelve los más cercanos y agrega `distanciaKm`. */
export function buscarPuntos(opts = {}) {
  const { comuna, comunaId, region, regionId, q, tipo, lat, lng } = opts;
  const nComuna = comuna != null ? norm(comuna) : null;
  const nRegion = region != null ? norm(region) : null;
  const nTipo = tipo != null ? norm(tipo) : null;
  const nQ = q != null && q !== '' ? norm(q) : null;

  const cId = comunaId != null ? Number(comunaId) : null;
  const rId = regionId != null ? Number(regionId) : null;

  let out = [];
  for (let i = 0; i < PUNTOS.length; i++) {
    const p = PUNTOS[i];
    if (cId != null && p.direccion.comunaId !== cId) continue;
    if (nComuna && norm(p.direccion.comuna) !== nComuna) continue;
    if (rId != null && p.direccion.regionId !== rId) continue;
    if (nRegion && norm(p.direccion.region) !== nRegion) continue;
    if (nTipo && norm(p.tipo) !== nTipo) continue;
    if (nQ && !HAYSTACK[i].includes(nQ)) continue;
    out.push(p);
  }

  // Proximidad: solo si vinieron ambas coordenadas válidas.
  const hasGeo = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  if (hasGeo) {
    const la = Number(lat);
    const ln = Number(lng);
    out = out
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        ...p,
        distanciaKm: Math.round(distanciaKm(la, ln, p.lat, p.lng) * 100) / 100,
      }))
      .sort((a, b) => a.distanciaKm - b.distanciaKm);
  }

  return out;
}
