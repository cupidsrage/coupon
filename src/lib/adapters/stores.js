// Per-store scraper configs, consumed by makeScraperAdapter().
//
// Walmart + Target use ScraperAPI's structured endpoints (parsed JSON — most
// robust). The drugstore/regional chains have no structured endpoint, so they
// render the store's own search page through ScraperAPI and pull products from
// the embedded hydration JSON. Those parsers are best-effort and isolated:
// if a site changes shape, selectItems() returns [] and the run continues.

import { makeScraperAdapter, toNumber } from "./scraper-factory.js";

// --- Walmart: structured endpoint ---------------------------------------
const walmart = makeScraperAdapter({
  id: "walmart",
  label: "Walmart",
  mode: "structured",
  structuredUrl: "https://api.scraperapi.com/structured/walmart/search",
  policy: { doubles: 0 },
  selectItems: (json) =>
    json?.organic_results || json?.items || json?.products || [],
  mapItem: (it) => ({
    upc: it.us_item_id || it.product_id || null,
    name: it.title || it.name || "Unknown",
    brand: it.brand || null,
    size: null,
    price: toNumber(it.list_price ?? it.regular_price ?? it.price),
    sale_price: salePrice(it.price, it.list_price ?? it.regular_price),
  }),
});

// --- Target: structured endpoint ----------------------------------------
const target = makeScraperAdapter({
  id: "target-scraper",
  label: "Target",
  mode: "structured",
  structuredUrl: "https://api.scraperapi.com/structured/target/search",
  policy: { doubles: 0 },
  selectItems: (json) =>
    json?.organic_results || json?.products || json?.items || [],
  mapItem: (it) => ({
    upc: it.tcin || it.upc || null,
    name: it.title || it.name || "Unknown",
    brand: it.brand || null,
    size: null,
    price: toNumber(it.regular_price ?? it.list_price ?? it.price),
    sale_price: salePrice(it.price ?? it.current_price, it.regular_price ?? it.list_price),
  }),
});

// --- Walgreens: rendered search page ------------------------------------
const walgreens = makeScraperAdapter({
  id: "walgreens-scraper",
  label: "Walgreens",
  mode: "rendered",
  render: true,
  waitFor: ".product-tile, [data-testid='product-tile']",
  embeddedGlobals: ["__PRELOADED_STATE__", "__APP_INITIAL_STATE__"],
  searchUrl: (term) =>
    `https://www.walgreens.com/search/results.jsp?Ntt=${encodeURIComponent(term)}`,
  policy: { doubles: 0 },
  selectItems: (json) => deepFindProducts(json),
  mapItem: mapGenericProduct,
});

// --- Albertsons (+ Safeway/Vons banners): rendered ----------------------
const albertsons = makeScraperAdapter({
  id: "albertsons",
  label: "Albertsons",
  mode: "rendered",
  render: true,
  premium: true, // grocery banners tend to bot-gate harder
  embeddedGlobals: ["__PRELOADED_STATE__", "__NEXT_DATA__"],
  searchUrl: (term) =>
    `https://www.albertsons.com/shop/search-results.html?q=${encodeURIComponent(term)}`,
  policy: { doubles: 0 },
  selectItems: (json) => deepFindProducts(json),
  mapItem: mapGenericProduct,
});

// --- Publix: rendered ----------------------------------------------------
const publix = makeScraperAdapter({
  id: "publix",
  label: "Publix",
  mode: "rendered",
  render: true,
  embeddedGlobals: ["__NEXT_DATA__", "__PRELOADED_STATE__"],
  searchUrl: (term) =>
    `https://www.publix.com/search?q=${encodeURIComponent(term)}`,
  policy: { doubles: 0 },
  selectItems: (json) => deepFindProducts(json),
  mapItem: mapGenericProduct,
});

// --- CVS: rendered -------------------------------------------------------
const cvs = makeScraperAdapter({
  id: "cvs",
  label: "CVS",
  mode: "rendered",
  render: true,
  premium: true,
  embeddedGlobals: ["__APP_INITIAL_STATE__", "__NEXT_DATA__"],
  searchUrl: (term) =>
    `https://www.cvs.com/search?searchTerm=${encodeURIComponent(term)}`,
  policy: { doubles: 0 },
  selectItems: (json) => deepFindProducts(json),
  mapItem: mapGenericProduct,
});

export const scraperAdapters = {
  walmart,
  "target-scraper": target,
  "walgreens-scraper": walgreens,
  albertsons,
  publix,
  cvs,
};

// ---- shared mapping helpers --------------------------------------------

function salePrice(current, regular) {
  const c = toNumber(current);
  const r = toNumber(regular);
  if (c == null || r == null) return null;
  return c < r ? c : null;
}

function mapGenericProduct(it) {
  const price = toNumber(
    it.regularPrice ?? it.listPrice ?? it.basePrice ?? it.price?.regular ?? it.price
  );
  const promo = toNumber(
    it.salePrice ?? it.promoPrice ?? it.price?.promo ?? it.currentPrice
  );
  return {
    upc: it.upc || it.id || it.productId || it.sku || null,
    name: it.name || it.title || it.description || it.displayName || "Unknown",
    brand: it.brand || it.brandName || null,
    size: it.size || it.packageSize || null,
    price,
    sale_price: promo != null && price != null && promo < price ? promo : null,
  };
}

// Rendered pages hide products at varying depths in the hydration blob.
// Walk it and collect objects that look like priced products. Defensive by
// design: unknown shapes just yield nothing rather than throwing.
function deepFindProducts(json, depth = 0, out = []) {
  if (!json || typeof json !== "object" || depth > 8) return out;
  if (Array.isArray(json)) {
    for (const el of json) deepFindProducts(el, depth + 1, out);
    return out;
  }
  const looksLikeProduct =
    (json.name || json.title || json.displayName || json.description) &&
    (json.price != null ||
      json.regularPrice != null ||
      json.listPrice != null ||
      json.salePrice != null ||
      json.basePrice != null ||
      (json.price && typeof json.price === "object"));
  if (looksLikeProduct) out.push(json);
  for (const k of Object.keys(json)) {
    if (typeof json[k] === "object") deepFindProducts(json[k], depth + 1, out);
  }
  return out;
}
