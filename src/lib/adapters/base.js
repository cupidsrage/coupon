// Adapter contract + shared helpers.
//
// Every source (retailer API, aggregator feed, or scraper fallback) implements
// the same shape so the ingestion runner and the rest of the app never care
// where data came from:
//
//   {
//     id:        "kroger",              // stable slug
//     label:     "Kroger",             // display name
//     kind:      "retailer" | "aggregator",
//     legal:     "api" | "public-endpoint" | "scraper",
//     needsCreds: ["KROGER_CLIENT_ID", ...],   // env vars it requires
//     available(): boolean,            // are creds/flags present?
//     ingest({ storeId, ...opts }): Promise<{ products, coupons }>
//   }
//
// An adapter reports what it needs and whether it can run; the runner skips
// any that can't instead of throwing. Scraper adapters additionally gate on
// ENABLE_SCRAPERS so the fragile / ToS-sensitive path never runs by accident
// on a shared deployment.

import db from "../db.js";

export function scrapersEnabled() {
  return process.env.ENABLE_SCRAPERS === "1" || process.env.ENABLE_SCRAPERS === "true";
}

export function hasEnv(...names) {
  return names.every((n) => !!process.env[n]);
}

// Upsert a product by (store_id, upc) so re-ingesting refreshes price in place
// instead of duplicating rows. Falls back to (store_id, name) when no UPC.
const findByUpc = db.prepare(
  "SELECT id FROM product WHERE store_id = ? AND upc IS NOT NULL AND upc = ?"
);
const findByName = db.prepare(
  "SELECT id FROM product WHERE store_id = ? AND upc IS NULL AND name = ?"
);
const insertProduct = db.prepare(`
  INSERT INTO product (store_id, upc, name, brand, size, price, sale_price, updated_at)
  VALUES (@store_id, @upc, @name, @brand, @size, @price, @sale_price, datetime('now'))
`);
const updateProduct = db.prepare(`
  UPDATE product SET name=@name, brand=@brand, size=@size,
    price=@price, sale_price=@sale_price, updated_at=datetime('now')
  WHERE id=@id
`);

export function upsertProduct(p) {
  const row = p.upc ? findByUpc.get(p.store_id, p.upc) : findByName.get(p.store_id, p.name);
  if (row) {
    updateProduct.run({ ...p, id: row.id });
    return row.id;
  }
  return insertProduct.run(p).lastInsertRowid;
}

// Upsert a coupon. De-dupe on (source, store_id, brand, match_name, amount) so
// a feed re-run doesn't pile up duplicates.
const findCoupon = db.prepare(`
  SELECT id FROM coupon
  WHERE source=@source AND ifnull(store_id,-1)=ifnull(@store_id,-1)
    AND ifnull(brand,'')=ifnull(@brand,'') AND ifnull(match_name,'')=ifnull(@match_name,'')
    AND amount=@amount AND disc_type=@disc_type
`);
const insertCoupon = db.prepare(`
  INSERT INTO coupon
    (source, store_id, brand, match_name, match_upc, disc_type, amount,
     min_qty, max_discount, stackable, restrictions, expires)
  VALUES (@source, @store_id, @brand, @match_name, @match_upc, @disc_type,
     @amount, @min_qty, @max_discount, @stackable, @restrictions, @expires)
`);

export function upsertCoupon(c) {
  const norm = {
    source: c.source,
    store_id: c.store_id ?? null,
    brand: c.brand ?? null,
    match_name: c.match_name ?? null,
    match_upc: c.match_upc ?? null,
    disc_type: c.disc_type,
    amount: Number(c.amount),
    min_qty: Number(c.min_qty) || 1,
    max_discount: c.max_discount != null ? Number(c.max_discount) : null,
    stackable: c.stackable === false ? 0 : 1,
    restrictions: c.restrictions ?? null,
    expires: c.expires ?? null,
  };
  if (findCoupon.get(norm)) return null;
  return insertCoupon.run(norm).lastInsertRowid;
}

// Ensure a store row exists for an adapter's target store; return its id.
const findStore = db.prepare("SELECT id FROM store WHERE name = ?");
const insertStore = db.prepare(
  `INSERT INTO store (name, doubles, double_limit, allow_overage) VALUES (?, ?, ?, ?)`
);
export function ensureStore(name, policy = {}) {
  const row = findStore.get(name);
  if (row) return row.id;
  return insertStore.run(
    name,
    policy.doubles ? 1 : 0,
    policy.double_limit ?? 0,
    policy.allow_overage ? 1 : 0
  ).lastInsertRowid;
}

// Small polite fetch wrapper: timeout + a real UA + optional delay between
// calls. Used by every adapter, and especially by scraper fallbacks.
export async function politeFetch(url, opts = {}) {
  const { delayMs = 0, timeoutMs = 12000, ...rest } = opts;
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "StackrBot/0.1 (personal coupon tool)",
        Accept: "application/json",
        ...(rest.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}
