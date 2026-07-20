#!/usr/bin/env node
/* Prueba rápida del Cotizador de Chilexpress desde Node, sin tocar el sitio ni Flow.
   Sirve para confirmar que la Primary Key de bq-cotizador funciona desde código.

   USO:
     export CHX_RATING_KEY="<Primary Key de bq-cotizador>"
     node scripts/test-chilexpress-quote.mjs [destCode] [pesoKg]
   Ejemplos:
     node scripts/test-chilexpress-quote.mjs            # STGO -> PROV, 1 kg
     node scripts/test-chilexpress-quote.mjs CONC 2.5   # STGO -> Concepción, 2.5 kg

   (opcional CHX_SANDBOX=0 para producción; por defecto QA). Requiere Node 18+. */

const KEY = process.env.CHX_RATING_KEY;
if (!KEY) {
  console.error('✘ Falta CHX_RATING_KEY. export CHX_RATING_KEY="<Primary Key de bq-cotizador>"');
  process.exit(1);
}
const HOST = process.env.CHX_SANDBOX === '0'
  ? 'https://services.wschilexpress.com'
  : 'https://testservices.wschilexpress.com';

const dest = process.argv[2] || 'PROV';
const weight = process.argv[3] || '1';

const body = {
  originCountyCode: 'STGO',
  destinationCountyCode: dest,
  package: { weight: String(weight), height: '10', width: '25', length: '35' },
  productType: 3, contentType: 1, declaredWorth: '0', deliveryTime: 0,
};

console.log('→ Cotizando STGO → ' + dest + ' · ' + weight + ' kg …');
const res = await fetch(HOST + '/rating/api/v1.0/rates/courier', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Ocp-Apim-Subscription-Key': KEY },
  body: JSON.stringify(body),
});
const data = await res.json().catch(() => null);
console.log('HTTP ' + res.status + ' · statusDescription: ' + (data && data.statusDescription));

const opts = (data && data.data && data.data.courierServiceOptions) || [];
if (!opts.length) {
  console.log('Sin opciones. Respuesta completa:\n' + JSON.stringify(data, null, 2));
  process.exit(0);
}
for (const o of opts) {
  console.log('  ' + o.serviceDescription + ' (cod ' + o.serviceTypeCode + '): $' + o.serviceValue +
    '   peso ' + o.finalWeight + (o.didUseVolumetricWeight ? ' (volumétrico)' : ''));
}
const cheapest = opts.reduce((m, o) => (Number(o.serviceValue) < Number(m.serviceValue) ? o : m));
console.log('\n✓ El más barato (lo que cobraríamos): ' + cheapest.serviceDescription + ' = $' + cheapest.serviceValue);
