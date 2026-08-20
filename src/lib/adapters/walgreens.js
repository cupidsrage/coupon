// Walgreens — two paths:
//
//  1. Official Digital Offers API (partner-approved): returns clip-to-card
//     coupons. Requires WALGREENS_API_KEY + WALGREENS_AFF_ID from their
//     developer program. This is the durable, ToS-clean path.
//
//  2. Scraper fallback (ENABLE_SCRAPERS): reads the public weekly-ad / offers
//     JSON the site uses. Fragile and ToS-sensitive — personal use only.
//
// The adapter prefers the official API when creds exist, else falls back to the
// scraper only if scrapers are enabled, else reports unavailable.

import {
  hasEnv,
  scrapersEnabled,
  politeFetch,
  upsertCoupon,
  upsertProduct,
  ensureStore,
} from "./base.js";

const CREDS = ["WALGREENS_API_KEY", "WALGREENS_AFF_ID"];

async function ingestOfficial(storeId) {
  // Digital Offers API shape (partner docs). Endpoint/params per your approved
  // program; this maps the common response into our coupon schema.
  const res = await politeFetch("https://services.walgreens.com/api/offers/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: process.env.WALGREENS_API_KEY,
      affId: process.env.WALGREENS_AFF_ID,
      channel: "coupons",
    }),
    delayMs: 200,
  });
  if (!res.ok) throw new Error(`Walgreens offers ${res.status}`);
  const json = await res.json();
  let coupons = 0;
  for (const o of json?.offers || []) {
    upsertCoupon({
      source: "digital",
      store_id: storeId,
      brand: o.brand || null,
      match_name: o.productName || o.title || null,
      disc_type: o.valueType === "PERCENT" ? "percent" : "flat",
      amount: Number(o.value) || 0,
      min_qty: Number(o.minQty) || 1,
      restrictions: o.description || null,
      expires: o.expirationDate || null,
    });
    coupons++;
  }
  return { products: 0, coupons };
}

async function ingestScraper(storeId) {
  // Public offers JSON used by the site's coupon page. Best-effort parsing.
  const res = await politeFetch(
    "https://www.walgreens.com/offers/offers.jsp?tab=coupons",
    { headers: { Accept: "text/html" }, delayMs: 900, timeoutMs: 15000 }
  );
  if (!res.ok) throw new Error(`Walgreens page ${res.status}`);
  const html = await res.text();
  // The page bootstraps offers into a JSON blob; extract defensively.
  const m = html.match(/window\.__APP_INITIAL_STATE__\s*=\s*(\{.*?\});/s);
  if (!m) return { products: 0, coupons: 0 };
  let coupons = 0;
  try {
    const state = JSON.parse(m[1]);
    const offers = state?.offers?.list || state?.coupons?.items || [];
    for (const o of offers) {
      const flat = !/%/.test(String(o.value || o.summary || ""));
      upsertCoupon({
        source: "digital",
        store_id: storeId,
        brand: o.brand || null,
        match_name: o.title || o.summary || null,
        disc_type: flat ? "flat" : "percent",
        amount: parseAmount(o.value || o.summary) || 0,
        restrictions: o.disclaimer || null,
        expires: o.endDate || null,
      });
      coupons++;
    }
  } catch {
    /* tolerate schema drift */
  }
  return { products: 0, coupons };
}

export default {
  id: "walgreens",
  label: "Walgreens",
  kind: "retailer",
  legal: "api", // upgrades to scraper only when falling back
  needsCreds: CREDS,
  available: () => hasEnv(...CREDS) || scrapersEnabled(),

  async ingest({ storeName = "Walgreens" } = {}) {
    const storeId = ensureStore(storeName, { doubles: 0 });
    if (hasEnv(...CREDS)) return ingestOfficial(storeId);
    if (scrapersEnabled()) return ingestScraper(storeId);
    return { products: 0, coupons: 0, skipped: "no creds and scrapers off" };
  },
};

function parseAmount(s) {
  const m = String(s || "").match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}
