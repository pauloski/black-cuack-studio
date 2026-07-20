/* Cálculo del costo de envío a domicilio para un carrito. Lo usan tanto
   /api/shipping/quote (mostrar el costo) como /api/checkout (cobrarlo), para que
   la cotización sea idéntica en ambos y nunca se confíe en el costo del navegador. */

import { countyCodeFor, originCode } from './chilexpress-geo.js';
import { quoteShipping, DEFAULT_BOX } from './chilexpress.js';

// Peso por defecto (g) si un producto no trae peso_gramos: evita cotizar en ~0.
const DEFAULT_ITEM_GRAMS = 500;
const MIN_KG = 0.1;

// Tarifa de respaldo (CLP) si Chilexpress no responde: no romper la venta. El
// checkout la usa como fallback y lo registra para conciliar.
export const FALLBACK_SHIPPING = 5990;

/* Peso total del carrito en kg: suma peso_gramos × qty, con default por ítem. */
export function cartWeightKg(catalog, lines) {
  let grams = 0;
  for (const l of lines) {
    const p = catalog.get(l.id);
    const w = p && p.peso_gramos != null && p.peso_gramos > 0 ? p.peso_gramos : DEFAULT_ITEM_GRAMS;
    grams += w * l.qty;
  }
  return Math.max(MIN_KG, Math.round(grams) / 1000);
}

/* Caja del envío (cm) para un solo bulto: por cada dimensión toma el máximo entre
   los productos del carrito (heurística simple), y cae a la caja por defecto si el
   producto no trae ese dato. Chilexpress calcula el peso volumétrico con esto. */
export function cartBox(catalog, lines) {
  let h = 0, w = 0, l = 0;
  for (const line of lines) {
    const p = catalog.get(line.id);
    if (!p) continue;
    if (p.alto_cm > 0) h = Math.max(h, p.alto_cm);
    if (p.ancho_cm > 0) w = Math.max(w, p.ancho_cm);
    if (p.largo_cm > 0) l = Math.max(l, p.largo_cm);
  }
  return {
    height: h || DEFAULT_BOX.height,
    width: w || DEFAULT_BOX.width,
    length: l || DEFAULT_BOX.length,
  };
}

/* Cotiza el envío a domicilio para un carrito ya validado/priced.
   `comuna` es la comuna canónica (de lookupComuna). `amount` es el valor de los
   productos (se declara a Chilexpress). Devuelve:
     { ok:true, costo, servicio, weightKg }
     { ok:false, noCoverage:true, error }   // comuna destino sin cobertura
     { ok:false, error, errors }            // la API falló / origen mal configurado */
export async function computeShipping(env, catalog, comuna, lines, amount) {
  const destCode = countyCodeFor(comuna);
  if (!destCode) {
    return { ok: false, noCoverage: true, error: 'Chilexpress no despacha a ' + comuna + '.' };
  }
  const oc = originCode(env);
  if (!oc) {
    return { ok: false, error: 'Origen de despacho mal configurado (revisar CHX_ORIGIN_COMUNA).' };
  }
  const q = await quoteShipping(env, {
    originCode: oc,
    destCode,
    weightKg: cartWeightKg(catalog, lines),
    box: cartBox(catalog, lines),
    declaredWorth: amount,
  });
  if (!q.ok) return { ok: false, error: q.error, errors: q.errors };
  return { ok: true, costo: q.costo, servicio: q.servicio, weightKg: q.finalWeight };
}
