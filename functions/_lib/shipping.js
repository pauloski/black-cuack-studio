/* Validación de los datos de despacho (envío a domicilio con Chilexpress).

   Esta es la validación que MANDA. La del navegador es solo cortesía para el
   usuario: cualquiera puede saltársela con un POST directo. */

import { lookupComuna } from './comunas.js';

/* ---------- RUT ---------- */

/* Deja solo dígitos + K final: "12.345.678-5" → "123456785" */
export function cleanRut(rut) {
  return String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
}

/* Dígito verificador por módulo 11, con serie de multiplicadores 2..7. */
export function rutCheckDigit(body) {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return '0';
  if (rest === 10) return 'K';
  return String(rest);
}

export function isValidRut(rut) {
  const clean = cleanRut(rut);
  if (clean.length < 8 || clean.length > 9) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  return rutCheckDigit(body) === dv;
}

/* "123456785" → "12.345.678-5" para guardar y mostrar de forma consistente. */
export function formatRut(rut) {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
}

/* ---------- Teléfono ---------- */

/* Móvil chileno: 9 dígitos partiendo en 9. Acepta +56, 56 y espacios. */
export function normalizePhone(input) {
  let d = String(input || '').replace(/[^\d]/g, '');
  if (d.startsWith('56')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('9')) return '+56' + d;
  return null;
}

/* ---------- Validación completa ---------- */

const MAX = { nombre: 80, direccion: 160, referencia: 120 };

export function validateShipping(input) {
  const errors = {};
  const out = {};

  const nombre = String(input?.nombre || '').trim().replace(/\s+/g, ' ');
  // El courier necesita un destinatario identificable: exigimos nombre y apellido.
  if (nombre.length < 5 || nombre.length > MAX.nombre || !nombre.includes(' ')) {
    errors.nombre = 'Ingresa tu nombre y apellido.';
  } else {
    out.nombre = nombre;
  }

  if (!isValidRut(input?.rut)) {
    errors.rut = 'RUT inválido. Revisa el dígito verificador.';
  } else {
    out.rut = formatRut(input.rut);
  }

  const phone = normalizePhone(input?.telefono);
  if (!phone) {
    errors.telefono = 'Teléfono móvil inválido (ej: 9 1234 5678).';
  } else {
    out.telefono = phone;
  }

  const direccion = String(input?.direccion || '').trim().replace(/\s+/g, ' ');
  // Sin número, el courier no puede entregar.
  if (direccion.length < 6 || direccion.length > MAX.direccion) {
    errors.direccion = 'Ingresa calle y número.';
  } else if (!/\d/.test(direccion)) {
    errors.direccion = 'La dirección debe incluir el número.';
  } else {
    out.direccion = direccion;
  }

  /* La comuna define la tarifa y la cobertura del courier: tiene que ser una
     comuna real, no texto libre. Guardamos la forma canónica. */
  const found = lookupComuna(input?.comuna);
  if (!found) {
    errors.comuna = 'Selecciona una comuna válida.';
  } else {
    out.comuna = found.comuna;
    out.region = found.region;
  }

  const referencia = String(input?.referencia || '').trim().slice(0, MAX.referencia);
  if (referencia) out.referencia = referencia;

  return { ok: Object.keys(errors).length === 0, errors, shipping: out };
}
