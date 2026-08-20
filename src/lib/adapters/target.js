// Target — Redsky. Target's storefront is a React app backed by public Redsky
// JSON endpoints serving product/price/promotion data. It's publicly reachable
// (Target has said the data is public), but it is NOT a partner-authenticated
// API: it rotates its web api_key, rate-limits, and captcha/IP-blocks
// aggressive callers. So this is a "public-endpoint" source — usable for a
// personal tool, fragile for anything public.
//
// Because it leans on an undocumented web key, it's gated behind ENABLE_SCRAPERS
// like the true scrapers. If Target rotates the key, set TARGET_API_KEY from a
// fresh browser Network-tab capture, or the adapter tries to scrape one.

import {
  scrapersEnabled,
  politeFetch,
  upsertProduct,
  ensureStore,
} from "./base.js";

// A known-public Redsky web key; Target rotates these, so allow override.
const FALLBACK_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";

async function resolveKey() {
  if (process.env.TARGET_API_KEY) return process.env.TARGET_API_KEY;
  // Best-effort: pull a fresh key from a public Target page if the fallback dies.
  try {
    const res = await politeFetch("https://www.target.com/", {
      headers: { Accept: "text/html" },
      delayMs: 300,
    });
    const html = await res.text();
    const m = html.match(/"apiKey":"([a-f0-9]{40})"/);
    if (m) return m[1];
  } catch {
    /* fall through */
  }
  return FALLBACK_KEY;
}

export default {
  id: "target",
  label: "Target",
  kind: "retailer",
  legal: "public-endpoint",
  needsCreds: [], // key optional; falls back
  available: () => scrapersEnabled(),

  // opts: { storeId (Target store #), terms: [], storeName? }
  async ingest({ storeId: tgtStore = "1375", terms = [], storeName = "Target" }) {
    const storeId = ensureStore(storeName, { doubles: 0 });
    const key = await resolveKey();
    let products = 0;
    for (const term of terms) {
      const url = new URL(
        "https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2"
      );
      url.searchParams.set("key", key);
      url.searchParams.set("keyword", term);
      url.searchParams.set("count", "24");
      url.searchParams.set("offset", "0");
      url.searchParams.set("store_ids", tgtStore);
      url.searchParams.set("pricing_store_id", tgtStore);
      const res = await politeFetch(url, { delayMs: 800, timeoutMs: 15000 });
      if (!res.ok) continue;
      let json;
      try {
        json = await res.json();
      } catch {
        continue;
      }
      const items = json?.data?.search?.products || [];
      for (const it of items) {
        const price = it?.price?.reg_retail ?? it?.price?.current_retail ?? null;
        const promo = it?.price?.current_retail ?? null;
        if (price == null) continue;
        const desc = it?.item?.product_description || {};
        upsertProduct({
          store_id: storeId,
          upc: it?.item?.primary_barcode || null,
          name: stripTags(desc.title) || "Unknown",
          brand: desc?.brand || it?.item?.primary_brand?.name || null,
          size: null,
          price,
          sale_price: promo != null && promo < price ? promo : null,
        });
        products++;
      }
    }
    return { products, coupons: 0 };
  },
};

function stripTags(s) {
  return s ? String(s).replace(/<[^>]*>/g, "").trim() : s;
}
