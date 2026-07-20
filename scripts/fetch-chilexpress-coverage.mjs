#!/usr/bin/env node
/* Genera functions/_lib/chilexpress-coverage-data.js: el mapa
   comuna -> countyCode de Chilexpress, bajándolo UNA vez desde la API Coberturas.

   El Cotizador exige un countyCode de 4 letras (ej. "PROV"), no el nombre de la
   comuna. Este script baja todas las comunas con su código y arma la traducción.

   USO:
     export CHX_COVERAGE_KEY="<Primary Key de la suscripción bq-cobertura>"
     node scripts/fetch-chilexpress-coverage.mjs
   (opcional: CHX_SANDBOX=0 para producción; por defecto usa QA testservices)

   Requiere Node 18+ (fetch nativo). NO toca producción ni datos: solo escribe un
   archivo local. Es idempotente: puedes correrlo las veces que quieras. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const KEY = process.env.CHX_COVERAGE_KEY;
if (!KEY) {
  console.error('✘ Falta CHX_COVERAGE_KEY.');
  console.error('  export CHX_COVERAGE_KEY="<Primary Key de bq-cobertura>"  &&  node scripts/fetch-chilexpress-coverage.mjs');
  process.exit(1);
}

const HOST = process.env.CHX_SANDBOX === '0'
  ? 'https://services.wschilexpress.com'
  : 'https://testservices.wschilexpress.com';

// Misma normalización que functions/_lib/comunas.js: sin tildes, minúsculas, solo alfanumérico.
function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function chx(path) {
  const res = await fetch(HOST + path, {
    headers: { 'Ocp-Apim-Subscription-Key': KEY, 'Cache-Control': 'no-cache' },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error('HTTP ' + res.status + ' en ' + path);
  return data;
}

// 1) Regiones ---------------------------------------------------------------
console.log('→ Bajando regiones…');
const regionsResp = await chx('/georeference/api/v1.0/regions');
const regions = regionsResp.regions || [];
console.log('  ' + regions.length + ' regiones.');

// 2) Comunas por región (type=1 = comunas) ----------------------------------
const cx = new Map(); // normalizado(countyName) -> { code, name }
for (const r of regions) {
  const resp = await chx('/georeference/api/v1.0/coverage-areas?RegionCode=' + encodeURIComponent(r.regionId) + '&type=1');
  const areas = resp.coverageAreas || [];
  for (const a of areas) {
    if (a.countyCode && a.countyName) cx.set(normalize(a.countyName), { code: a.countyCode, name: a.countyName });
  }
  console.log('  ' + r.regionName + ': ' + areas.length + ' comunas.');
}
console.log('→ Chilexpress cubre ' + cx.size + ' comunas.');

// 3) Nuestras comunas (extraídas de comunas.js, sin importar el módulo) ------
const src = readFileSync(join(ROOT, 'functions/_lib/comunas.js'), 'utf8');
const ours = [];
for (const block of src.matchAll(/comunas:\s*\[([\s\S]*?)\]/g)) {
  for (const s of block[1].matchAll(/"([^"]+)"/g)) ours.push(s[1]);
}
console.log('→ Nuestras comunas: ' + ours.length + '.');

// 4) Cruce -------------------------------------------------------------------
const map = {};
const unmatched = [];
for (const c of ours) {
  const hit = cx.get(normalize(c));
  if (hit) map[normalize(c)] = hit.code;
  else unmatched.push(c);
}

// 5) Escribir el módulo de datos --------------------------------------------
const out = `/* GENERADO por scripts/fetch-chilexpress-coverage.mjs — NO editar a mano.
   Mapa comuna (nombre normalizado) -> countyCode de Chilexpress, para el Cotizador.
   Regenerar si Chilexpress cambia su cobertura. Los ajustes a mano (comuna de
   origen, aliases de nombres) van en chilexpress-geo.js, no en este archivo. */

export const COUNTY_CODES = ${JSON.stringify(map, null, 2)};
`;
writeFileSync(join(ROOT, 'functions/_lib/chilexpress-coverage-data.js'), out);

// 6) Reporte -----------------------------------------------------------------
console.log('\n✓ Escrito functions/_lib/chilexpress-coverage-data.js');
console.log('  ' + Object.keys(map).length + '/' + ours.length + ' comunas mapeadas.');
if (unmatched.length) {
  // Candidatos por coincidencia de sub-cadenas de 4 letras (más robusto que por prefijo).
  const grams = (s, n = 4) => { const g = new Set(); for (let i = 0; i + n <= s.length; i++) g.add(s.slice(i, i + n)); return g; };
  console.log('\n⚠ ' + unmatched.length + ' comunas sin código directo (nombre distinto en Chilexpress).');
  console.log('  Candidatos reales de Chilexpress (NOMBRE=código) para cada una:');
  for (const c of unmatched) {
    const g = grams(normalize(c));
    const cands = [...cx.values()]
      .filter((v) => { const vn = normalize(v.name); return [...g].some((x) => vn.includes(x)); })
      .map((v) => v.name + '=' + v.code);
    console.log('  - ' + c + '   → ' + (cands.length ? cands.join(' · ') : '(sin candidatos)'));
  }
  console.log('\n👉 Pega TODO este bloque en el chat y armamos los aliases que faltan.');
}
