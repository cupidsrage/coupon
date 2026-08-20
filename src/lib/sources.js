// Data source adapters.
//
// Each adapter pulls products + prices for one store and normalizes them into
// the product table. Start with one store, add more behind this interface.
//
// The Kroger adapter below is a stub showing the shape. To make it live:
//  1. Register at https://developer.kroger.com and get a client id/secret.
//  2. Set KROGER_CLIENT_ID / KROGER_CLIENT_SECRET in Railway env vars.
//  3. Fill in fetchToken() and fetchProducts() with real calls.
//
// Keep scraping-based adapters out of a public deployment: most coupon and
// retailer sites forbid it in their ToS. For a personal-only tool it's a
// judgment call, but retailer/affiliate APIs are the durable path.

import db from "./db.js";

async function fetchToken() {
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Kroger credentials not set");
  const res = await fetch("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return (await res.json()).access_token;
}

// Pull products for a term at a given Kroger locationId, upsert into product.
export async function ingestKroger({ storeId, locationId, terms }) {
  const token = await fetchToken();
  const upsert = db.prepare(`
    INSERT INTO product (store_id, upc, name, brand, size, price, sale_price, updated_at)
    VALUES (@store_id, @upc, @name, @brand, @size, @price, @sale_price, datetime('now'))
  `);
  let count = 0;
  for (const term of terms) {
    const url = new URL("https://api.kroger.com/v1/products");
    url.searchParams.set("filter.term", term);
    url.searchParams.set("filter.locationId", locationId);
    url.searchParams.set("filter.limit", "50");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) continue;
    const { data } = await res.json();
    for (const p of data || []) {
      const item = p.items?.[0] || {};
      const price = item.price?.regular ?? null;
      const promo = item.price?.promo ?? null;
      if (price == null) continue;
      upsert.run({
        store_id: storeId,
        upc: p.upc,
        name: p.description,
        brand: p.brand,
        size: item.size,
        price,
        sale_price: promo && promo < price ? promo : null,
      });
      count++;
    }
  }
  return count;
}
