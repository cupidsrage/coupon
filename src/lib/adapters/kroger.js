// Kroger — official API. OAuth client-credentials, product + promo price per
// location. The cleanest, most durable source; no scraper needed.
//
// Setup: register at developer.kroger.com, set KROGER_CLIENT_ID and
// KROGER_CLIENT_SECRET. Find a locationId via the Locations API for your store.

import { hasEnv, politeFetch, upsertProduct, ensureStore } from "./base.js";

const CREDS = ["KROGER_CLIENT_ID", "KROGER_CLIENT_SECRET"];

async function token() {
  const res = await politeFetch("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`
        ).toString("base64"),
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  if (!res.ok) throw new Error(`Kroger token ${res.status}`);
  return (await res.json()).access_token;
}

export default {
  id: "kroger",
  label: "Kroger",
  kind: "retailer",
  legal: "api",
  needsCreds: CREDS,
  available: () => hasEnv(...CREDS),

  // opts: { locationId, terms: [], storeName? }
  async ingest({ locationId, terms = [], storeName = "Kroger" }) {
    const storeId = ensureStore(storeName, { doubles: 0 });
    const t = await token();
    let products = 0;
    for (const term of terms) {
      const url = new URL("https://api.kroger.com/v1/products");
      url.searchParams.set("filter.term", term);
      url.searchParams.set("filter.locationId", locationId);
      url.searchParams.set("filter.limit", "50");
      const res = await politeFetch(url, {
        headers: { Authorization: `Bearer ${t}` },
        delayMs: 250,
      });
      if (!res.ok) continue;
      const { data } = await res.json();
      for (const p of data || []) {
        const item = p.items?.[0] || {};
        const price = item.price?.regular ?? null;
        const promo = item.price?.promo ?? null;
        if (price == null) continue;
        upsertProduct({
          store_id: storeId,
          upc: p.upc,
          name: p.description,
          brand: p.brand,
          size: item.size,
          price,
          sale_price: promo && promo < price ? promo : null,
        });
        products++;
      }
    }
    return { products, coupons: 0 };
  },
};
