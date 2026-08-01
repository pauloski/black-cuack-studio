/* Catálogo leído desde Contentful del lado servidor.

   Razón de existir: el precio que se cobra NUNCA puede venir del navegador. El
   browser manda {id, size, color, design, qty}; el precio y la variante se
   resuelven acá contra Contentful. El stock lo valida D1 (reserva atómica),
   no este módulo. */

import { variantKey } from './stock.js';

// Número válido (> vacío/no numérico → null). Para campos opcionales de Contentful.
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getCatalog(env, opts = {}) {
  const space = env.CONTENTFUL_SPACE_ID;
  const token = env.CONTENTFUL_ACCESS_TOKEN;
  const environment = env.CONTENTFUL_ENVIRONMENT || 'master';

  if (!space || !token) {
    throw new Error('Faltan CONTENTFUL_SPACE_ID / CONTENTFUL_ACCESS_TOKEN en el entorno de la Function.');
  }

  // include=2 resuelve las referencias variants en una sola llamada.
  const url =
    'https://cdn.contentful.com/spaces/' + space +
    '/environments/' + environment +
    '/entries?access_token=' + encodeURIComponent(token) +
    '&content_type=product&include=2&limit=100';

  // fresh=true (resync): fetch plano SIN opt-in a la caché de Cloudflare, para
  // leer lo recién publicado. El runtime de Workers no acepta el campo `cache`,
  // así que la frescura se logra no activando cacheEverything (que sí cachea 60s).
  const init = opts.fresh ? {} : { cf: { cacheTtl: 60, cacheEverything: true } };
  const res = await fetch(url, init);
  if (!res.ok) throw new Error('Contentful ' + res.status);

  const data = await res.json();
  const entries = {};
  for (const e of (data.includes && data.includes.Entry) || []) entries[e.sys.id] = e;
  // Índice de Assets (imágenes) para resolver el link f.image → URL. Lo usa el feed
  // de productos (Google Merchant / Meta) y cualquier consumidor server-side.
  const assets = {};
  for (const a of (data.includes && data.includes.Asset) || []) assets[a.sys.id] = a;
  const assetUrl = (link) => {
    const a = link && link.sys ? assets[link.sys.id] : null;
    const u = a && a.fields && a.fields.file && a.fields.file.url;
    if (!u) return '';
    return u.indexOf('//') === 0 ? 'https:' + u : u;
  };

  const map = new Map();
  for (const entry of data.items || []) {
    const f = entry.fields || {};
    if (!f.id) continue;
    const price = Math.round(Number(f.price) || 0);

    const variants = (f.variants || [])
      .map((link) => (link && link.sys ? entries[link.sys.id] : null))
      .filter(Boolean)
      .map((v) => {
        const vf = v.fields || {};
        const attrs = { size: vf.size || '', color: vf.color || '', design: vf.design || '' };
        return {
          ...attrs,
          key: variantKey(attrs),
          price: Math.round(Number(vf.price != null ? vf.price : price) || 0),
          initialStock: vf.stock != null ? Number(vf.stock) : 0
        };
      });

    map.set(f.id, {
      id: f.id,
      product_title: f.product_title || '',
      description: f.descripcin || f['descripción'] || f.descripcion || '',
      image_url: assetUrl(f.image),
      price,
      stock: f.stock != null ? Number(f.stock) : null, // fallback simple
      // Peso y dimensiones para cotizar el envío con Chilexpress. Acepta el ID de
      // Contentful con o sin sufijo de unidad (peso_gramos|peso, alto_cm|alto, ...).
      // Si faltan, shipping-quote usa un peso y una caja por defecto.
      peso_gramos: numOrNull(f.peso_gramos != null ? f.peso_gramos : f.peso),
      alto_cm: numOrNull(f.alto_cm != null ? f.alto_cm : f.alto),
      ancho_cm: numOrNull(f.ancho_cm != null ? f.ancho_cm : f.ancho),
      largo_cm: numOrNull(f.largo_cm != null ? f.largo_cm : f.largo),
      variants
    });
  }
  return map;
}

/* Unidades a sembrar en D1: cada variante, o una sola unidad '' si es simple.
   Para producto simple sin stock global definido, siembra 0 (y se registra). */
export function seedUnits(product) {
  if (product.variants.length) {
    return product.variants.map((v) => ({
      size: v.size, color: v.color, design: v.design, initialStock: v.initialStock
    }));
  }
  return [{ size: '', color: '', design: '', initialStock: product.stock != null ? product.stock : 0 }];
}

/* Valida y precia el carrito. Resuelve la variante elegida y su precio de
   servidor. NO valida stock: eso lo hace la reserva atómica en D1. */
export function priceCart(items, catalog) {
  if (!Array.isArray(items) || items.length === 0) return { error: 'Carrito vacío.' };
  if (items.length > 50) return { error: 'Demasiados ítems.' };

  const lines = [];
  let amount = 0;

  for (const raw of items) {
    const id = String(raw && raw.id ? raw.id : '');
    const qty = Number(raw && raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      return { error: 'Cantidad inválida para ' + (id || 'un producto') + '.' };
    }

    const p = catalog.get(id);
    if (!p) return { error: 'Producto no disponible: ' + id + '.' };

    const attrs = { size: raw.size || '', color: raw.color || '', design: raw.design || '' };
    const key = variantKey(attrs);

    let unitPrice, label;
    if (p.variants.length) {
      const variant = p.variants.find((v) => v.key === key);
      if (!variant) return { error: 'Debes elegir una variante válida de ' + p.product_title + '.' };
      unitPrice = variant.price;
      label = [variant.size, variant.color, variant.design].filter(Boolean).join(' / ');
    } else {
      unitPrice = p.price;
      label = '';
    }
    if (unitPrice <= 0) return { error: 'Producto sin precio válido: ' + id + '.' };

    lines.push({
      id: p.id, key, product_title: p.product_title, variant_label: label,
      size: attrs.size, color: attrs.color, design: attrs.design,
      qty, unit_price: unitPrice, line_total: unitPrice * qty
    });
    amount += unitPrice * qty;
  }

  amount = Math.round(amount);
  if (amount <= 0) return { error: 'Monto inválido.' };
  return { lines, amount };
}

/* "Polerón BlackQuack (M) x2 + 1 más" — subject tope 255 en Flow. */
export function buildSubject(lines) {
  const l0 = lines[0];
  const head = l0.product_title + (l0.variant_label ? ' (' + l0.variant_label + ')' : '') + (l0.qty > 1 ? ' x' + l0.qty : '');
  const rest = lines.length - 1;
  const subject = 'BlackQuack — ' + head + (rest > 0 ? ' + ' + rest + ' producto' + (rest > 1 ? 's' : '') + ' más' : '');
  return subject.slice(0, 255);
}
