-- BlackQuack — stock transaccional sobre Cloudflare D1.
-- Verdad del stock en vivo. Contentful administra el catálogo y el stock INICIAL.
--
-- Cada fila es un SKU = producto + variante. La variante se identifica por
-- variant_key (talla+color+diseño normalizados; '' si el producto es simple).
-- El decremento es atómico y condicional: ver functions/_lib/stock.js.

CREATE TABLE IF NOT EXISTS stock (
  product_id  TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT '',   -- '' = producto sin variantes
  size        TEXT,                        -- atributos de display (originales)
  color       TEXT,
  design      TEXT,
  qty         INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  seeded_from TEXT,                        -- 'contentful' | 'manual'
  updated_at  TEXT,
  PRIMARY KEY (product_id, variant_key)
);

-- Bitácora de movimientos: auditar seed, reservas, ventas y liberaciones.
CREATE TABLE IF NOT EXISTS stock_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT '',
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,               -- seed | reserve | release | commit | adjust
  ref         TEXT,                        -- token de Flow / commerceOrder
  created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_ledger_ref ON stock_ledger(ref);
