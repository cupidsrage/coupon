import { Router } from "express";
import db from "../lib/db.js";
import { searchProducts, couponsForProduct } from "../lib/match.js";
import { bestStack } from "../lib/stack.js";
import { adapterStatus, runIngest } from "../lib/adapters/index.js";
import { jobs as ingestJobs } from "../ingest.js";

const router = Router();

router.get("/stores", (req, res) => {
  res.json(db.prepare("SELECT * FROM store ORDER BY name").all());
});

// Search products and attach the best stack for each.
router.get("/search", (req, res) => {
  const { q = "", store } = req.query;
  const storeId = Number(store) || defaultStoreId();
  if (!storeId) return res.json({ store: null, results: [] });
  const st = db.prepare("SELECT * FROM store WHERE id = ?").get(storeId);
  const products = searchProducts(String(q).trim(), storeId);
  const results = products.map((p) => {
    const coupons = couponsForProduct(p);
    const stack = bestStack(p, coupons, st);
    return { product: p, stack, savings: (p.sale_price ?? p.price) - stack.unitPrice };
  });
  // Best deals first: biggest total savings off shelf price.
  results.sort((a, b) => savingsOffShelf(b) - savingsOffShelf(a));
  res.json({ store: st, results });
});

// Deals view: everything with a positive stack, ranked.
router.get("/deals", (req, res) => {
  const storeId = Number(req.query.store) || defaultStoreId();
  if (!storeId) return res.json({ store: null, results: [] });
  const st = db.prepare("SELECT * FROM store WHERE id = ?").get(storeId);
  const products = db
    .prepare("SELECT * FROM product WHERE store_id = ?")
    .all(storeId);
  const results = products
    .map((p) => {
      const coupons = couponsForProduct(p);
      const stack = bestStack(p, coupons, st);
      return { product: p, stack };
    })
    .filter((r) => savingsOffShelf(r) > 0);
  results.sort((a, b) => savingsOffShelf(b) - savingsOffShelf(a));
  res.json({ store: st, results: results.slice(0, 100) });
});

// Add a coupon manually.
router.post("/coupons", (req, res) => {
  const c = req.body || {};
  if (!c.source || c.amount == null || !c.disc_type)
    return res.status(400).json({ error: "source, disc_type and amount are required" });
  const info = db
    .prepare(
      `INSERT INTO coupon
       (source, store_id, brand, match_name, match_upc, disc_type, amount,
        min_qty, max_discount, stackable, restrictions, expires)
       VALUES (@source, @store_id, @brand, @match_name, @match_upc, @disc_type,
        @amount, @min_qty, @max_discount, @stackable, @restrictions, @expires)`
    )
    .run({
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
    });
  res.json({ id: info.lastInsertRowid });
});

// Which sources are configured and runnable right now.
router.get("/sources", (req, res) => {
  res.json(adapterStatus());
});

// Trigger a refresh. Protected by INGEST_TOKEN so a public deploy can't be
// hammered; set the token in Railway, pass ?token= or an x-ingest-token header.
router.post("/ingest", async (req, res) => {
  const need = process.env.INGEST_TOKEN;
  const got = req.get("x-ingest-token") || req.query.token;
  if (need && got !== need) return res.status(401).json({ error: "bad token" });
  const results = await runIngest(ingestJobs);
  res.json({ results });
});

function defaultStoreId() {
  const row = db.prepare("SELECT id FROM store ORDER BY id LIMIT 1").get();
  return row?.id;
}
function savingsOffShelf(r) {
  return r.product.price - r.stack.unitPrice;
}

export default router;
