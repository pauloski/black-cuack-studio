/* BlackQuack — stock transaccional sobre Cloudflare D1.

   Por qué D1 y no Contentful para el stock vivo: el decremento aquí es atómico
   y condicional (UPDATE ... WHERE qty >= n). Dos ventas simultáneas de la última
   unidad no pueden ganar ambas; la segunda afecta 0 filas y se rechaza. Un CMS
   no da esa garantía.

   División de responsabilidades:
   - Contentful  = catálogo + stock INICIAL (lo administra gente no técnica).
   - D1          = stock en vivo, sembrado desde Contentful la primera vez. */

const now = () => new Date().toISOString();
const clean = (v) => (v == null ? '' : String(v).trim());

/* Clave canónica de la variante. DEBE construirse igual en todos lados
   (frontend, /api/stock, checkout) o el stock no calzaría. Orden fijo
   talla→color→diseño, normalizado (sin tildes, minúsculas). Producto simple => ''. */
export function variantKey({ size, color, design } = {}) {
  const norm = (s) =>
    clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-');
  return [['size', size], ['color', color], ['design', design]]
    .filter(([, v]) => clean(v))
    .map(([k, v]) => `${k}:${norm(v)}`)
    .join('|');
}

/* Siembra idempotente desde el catálogo de Contentful. INSERT OR IGNORE: si el
   SKU ya existe en D1 (producto no nuevo), NO lo toca — D1 sigue siendo la verdad.
   Solo inserta los SKU que aún no existen, con el stock inicial de Contentful.
   Es seguro ante concurrencia: dos primeras lecturas simultáneas no duplican. */
export async function lazySeed(db, productId, variants) {
  for (const v of variants) {
    const key = variantKey(v);
    await db
      .prepare(
        `INSERT OR IGNORE INTO stock
           (product_id, variant_key, size, color, design, qty, seeded_from, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'contentful', ?)`
      )
      .bind(productId, key, clean(v.size) || null, clean(v.color) || null,
            clean(v.design) || null, Math.max(0, Number(v.initialStock) || 0), now())
      .run();
    // Ledger solo cuando de verdad insertó (changes) para no llenar de ruido.
  }
}

/* Stock en vivo por variant_key de un producto: { 'size:m': 15, 'size:xl': 0, '': 4 } */
export async function stockForProduct(db, productId) {
  const { results } = await db
    .prepare('SELECT variant_key, qty FROM stock WHERE product_id = ?')
    .bind(productId)
    .all();
  const map = {};
  for (const r of results) map[r.variant_key] = r.qty;
  return map;
}

/* Reserva atómica de UNA línea. true solo si había stock. La condición
   qty >= :n dentro del UPDATE es lo que hace imposible la sobreventa. */
export async function reserveLine(db, productId, key, n, ref) {
  const res = await db
    .prepare('UPDATE stock SET qty = qty - ?, updated_at = ? WHERE product_id = ? AND variant_key = ? AND qty >= ?')
    .bind(n, now(), productId, key, n)
    .run();
  const ok = res.meta.changes === 1;
  if (ok) {
    await db
      .prepare('INSERT INTO stock_ledger (product_id,variant_key,delta,reason,ref,created_at) VALUES (?,?,?,?,?,?)')
      .bind(productId, key, -n, 'reserve', ref, now())
      .run();
  }
  return ok;
}

export async function releaseLine(db, productId, key, n, ref) {
  await db
    .prepare('UPDATE stock SET qty = qty + ?, updated_at = ? WHERE product_id = ? AND variant_key = ?')
    .bind(n, now(), productId, key)
    .run();
  await db
    .prepare('INSERT INTO stock_ledger (product_id,variant_key,delta,reason,ref,created_at) VALUES (?,?,?,?,?,?)')
    .bind(productId, key, n, 'release', ref, now())
    .run();
}

/* Reserva un carrito completo. Si una línea falla, revierte las ya reservadas
   (D1 no da transacción con lógica JS en medio, así que compensamos a mano). */
export async function reserveCart(db, lines, ref) {
  const done = [];
  for (const l of lines) {
    const ok = await reserveLine(db, l.id, l.key, l.qty, ref);
    if (!ok) {
      for (const d of done) await releaseLine(db, d.id, d.key, d.qty, ref);
      return { ok: false, failed: { id: l.id, key: l.key } };
    }
    done.push(l);
  }
  return { ok: true };
}

export async function releaseCart(db, lines, ref) {
  for (const l of lines) await releaseLine(db, l.id, l.key, l.qty, ref);
}

/* RESTOCK / RESYNC autoritativo desde Contentful. Sobrescribe qty con el
   initial_stock que el admin acaba de escribir en Contentful (upsert: crea el
   SKU si no existe, machaca si existe). Registra el delta en la bitácora.

   OJO: es destructivo respecto a reservas en vuelo. Correr cuando no haya pagos
   a medio camino. Devuelve el detalle old→new por SKU. */
export async function resyncStock(db, productId, units) {
  const changes = [];
  for (const u of units) {
    const key = variantKey(u);
    const newQty = Math.max(0, Number(u.initialStock) || 0);

    const prev = await db
      .prepare('SELECT qty FROM stock WHERE product_id = ? AND variant_key = ?')
      .bind(productId, key)
      .first();
    const oldQty = prev ? prev.qty : null;

    await db
      .prepare(
        `INSERT INTO stock (product_id, variant_key, size, color, design, qty, seeded_from, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'contentful', ?)
         ON CONFLICT(product_id, variant_key)
         DO UPDATE SET qty = excluded.qty, seeded_from = 'contentful', updated_at = excluded.updated_at`
      )
      .bind(productId, key, clean(u.size) || null, clean(u.color) || null,
            clean(u.design) || null, newQty, now())
      .run();

    await db
      .prepare('INSERT INTO stock_ledger (product_id,variant_key,delta,reason,ref,created_at) VALUES (?,?,?,?,?,?)')
      .bind(productId, key, newQty - (oldQty || 0), 'restock', 'resync', now())
      .run();

    changes.push({ key, size: u.size || '', color: u.color || '', design: u.design || '', old: oldQty, new: newQty });
  }
  return changes;
}

/* AJUSTE MANUAL por DELTA (reabastecer / mermar) desde el admin. Aditivo:
   qty = qty + delta. Es SEGURO frente a reservas en vuelo porque qty ya las
   refleja (reserveLine las restó) — a diferencia del resync absoluto. El
   CHECK (qty >= 0) del esquema impide restar de más. Devuelve
   { ok:true, old, new, delta } o { ok:false, error, notFound? }. */
export async function adjustStock(db, productId, key, delta, motivo = 'ajuste') {
  const d = Math.trunc(Number(delta) || 0);
  if (!d) return { ok: false, error: 'El ajuste no puede ser 0.' };

  let row;
  try {
    row = await db
      .prepare('UPDATE stock SET qty = qty + ?, updated_at = ? WHERE product_id = ? AND variant_key = ? RETURNING qty')
      .bind(d, now(), productId, key)
      .first();
  } catch (e) {
    // CHECK (qty >= 0): el delta dejaría el stock negativo. Leemos el actual solo
    // para dar un mensaje útil (el UPDATE no cambió nada).
    const cur = await db
      .prepare('SELECT qty FROM stock WHERE product_id = ? AND variant_key = ?')
      .bind(productId, key)
      .first();
    return { ok: false, error: `No puedes restar ${-d}: solo hay ${cur ? cur.qty : 0} en stock.`, current: cur ? cur.qty : 0 };
  }

  // Sin fila afectada → el SKU aún no está sembrado en D1.
  if (!row) return { ok: false, notFound: true, error: 'SKU no encontrado en D1. Carga el inventario para sembrarlo y reintenta.' };

  const newQty = row.qty;
  await db
    .prepare('INSERT INTO stock_ledger (product_id,variant_key,delta,reason,ref,created_at) VALUES (?,?,?,?,?,?)')
    .bind(productId, key, d, 'adjust', String(motivo || 'ajuste').slice(0, 120), now())
    .run();

  return { ok: true, old: newQty - d, new: newQty, delta: d };
}

/* Deja rastro de que la reserva se convirtió en venta. El stock ya se descontó
   al reservar; esto es auditoría, no cambia cantidades. */
export async function commitCart(db, lines, ref) {
  for (const l of lines) {
    await db
      .prepare('INSERT INTO stock_ledger (product_id,variant_key,delta,reason,ref,created_at) VALUES (?,?,?,?,?,?)')
      .bind(l.id, l.key, 0, 'commit', ref, now())
      .run();
  }
}
