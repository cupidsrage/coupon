// Aggregator coupon feed — cross-store coupons under one contract.
//
// This maps a generic affiliate coupon feed (CouponAPI.org-style, or a network
// like CJ/Awin/Impact fronted by the same shape) into our coupon table. These
// feeds are the practical way to get coupons across many retailers at once, but
// they require a legitimate account + API key — there is no anonymous full dump.
//
// Set AGGREGATOR_API_URL and AGGREGATOR_API_KEY. The mapping below targets the
// common { offers: [{ store, brand, type, value, code, description, expiry }] }
// shape; adjust field names in mapOffer() to match your provider's schema.
//
// Coupons from a feed attach to whichever store row matches by name; unmatched
// stores are created so their coupons still surface once products exist.

import {
  hasEnv,
  politeFetch,
  upsertCoupon,
  ensureStore,
} from "./base.js";

const CREDS = ["AGGREGATOR_API_URL", "AGGREGATOR_API_KEY"];

function mapOffer(o) {
  const type = /percent|%/i.test(o.type || o.value || "") ? "percent" : "flat";
  const amount = parseAmount(o.value ?? o.discount ?? o.amount);
  return {
    storeName: o.store || o.merchant || o.retailer || null,
    brand: o.brand || null,
    match_name: o.productName || o.title || null,
    disc_type: type,
    amount,
    min_qty: Number(o.minQty || o.min_quantity) || 1,
    max_discount: o.maxDiscount != null ? Number(o.maxDiscount) : null,
    restrictions: [o.code ? `Code: ${o.code}` : null, o.description]
      .filter(Boolean)
      .join(" · ") || null,
    expires: o.expiry || o.endDate || o.expiration || null,
  };
}

export default {
  id: "aggregator",
  label: "Coupon feed (aggregator)",
  kind: "aggregator",
  legal: "api",
  needsCreds: CREDS,
  available: () => hasEnv(...CREDS),

  // opts: { storeFilter?: [names] } to limit which merchants you ingest.
  async ingest({ storeFilter = null } = {}) {
    const url = new URL(process.env.AGGREGATOR_API_URL);
    url.searchParams.set("apiKey", process.env.AGGREGATOR_API_KEY);
    const res = await politeFetch(url, { delayMs: 200, timeoutMs: 20000 });
    if (!res.ok) throw new Error(`Aggregator ${res.status}`);
    const json = await res.json();
    const offers = json.offers || json.data || json.coupons || [];

    let coupons = 0;
    for (const raw of offers) {
      const o = mapOffer(raw);
      if (!o.amount) continue;
      if (storeFilter && o.storeName && !storeFilter.includes(o.storeName)) continue;
      // Attach to a matching store row (create if missing) or leave store-agnostic.
      const store_id = o.storeName ? ensureStore(o.storeName) : null;
      const added = upsertCoupon({
        source: store_id ? "store" : "manufacturer",
        store_id,
        brand: o.brand,
        match_name: o.match_name,
        disc_type: o.disc_type,
        amount: o.amount,
        min_qty: o.min_qty,
        max_discount: o.max_discount,
        restrictions: o.restrictions,
        expires: o.expires,
      });
      if (added) coupons++;
    }
    return { products: 0, coupons };
  },
};

function parseAmount(s) {
  const m = String(s ?? "").match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}
