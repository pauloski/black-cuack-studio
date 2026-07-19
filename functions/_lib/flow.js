/* Cliente Flow para Cloudflare Pages Functions (runtime Workers).
   El secretKey solo existe acá: jamás debe cruzar al bundle del navegador. */

/* Elegir entre sandbox y producción es una decisión explícita, nunca un default.
   Si FLOW_SANDBOX no está definida, esto falla en vez de asumir producción:
   olvidar una variable de entorno no puede terminar cobrando dinero real. */
export function flowBase(env) {
  // FLOW_BASE_URL solo se define para tests locales contra un Flow simulado.
  if (env.FLOW_BASE_URL) return env.FLOW_BASE_URL;

  if (env.FLOW_SANDBOX === '1') return 'https://sandbox.flow.cl/api';
  if (env.FLOW_SANDBOX === '0') return 'https://www.flow.cl/api';

  throw new Error(
    'FLOW_SANDBOX no está definida. Debe ser "1" (sandbox) o "0" (producción). ' +
    'Sin este valor no se elige entorno de pago.'
  );
}

/* Firma Flow: parámetros ordenados alfabéticamente por nombre, concatenados
   como nombre+valor SIN separador, HMAC-SHA256 con secretKey, digest en hex.
   El propio parámetro "s" queda fuera del string a firmar. */
export async function signParams(params, secretKey) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join('');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function assertCreds(env) {
  if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY) {
    throw new Error('Faltan los secrets FLOW_API_KEY / FLOW_SECRET_KEY en Cloudflare Pages.');
  }
}

export async function flowPost(env, endpoint, params) {
  assertCreds(env);
  const body = { ...params, apiKey: env.FLOW_API_KEY };
  body.s = await signParams(body, env.FLOW_SECRET_KEY);

  const res = await fetch(flowBase(env) + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });

  const text = await res.text();
  if (!res.ok) throw new Error('Flow ' + endpoint + ' ' + res.status + ': ' + text.slice(0, 300));
  return JSON.parse(text);
}

export async function flowGet(env, endpoint, params) {
  assertCreds(env);
  const query = { ...params, apiKey: env.FLOW_API_KEY };
  query.s = await signParams(query, env.FLOW_SECRET_KEY);

  const res = await fetch(flowBase(env) + endpoint + '?' + new URLSearchParams(query).toString(), {
    method: 'GET'
  });

  const text = await res.text();
  if (!res.ok) throw new Error('Flow ' + endpoint + ' ' + res.status + ': ' + text.slice(0, 300));
  return JSON.parse(text);
}

/* 1 pendiente · 2 pagada · 3 rechazada · 4 anulada */
export const FLOW_STATUS = { PENDING: 1, PAID: 2, REJECTED: 3, CANCELED: 4 };

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
