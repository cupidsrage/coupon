// Scraper adapter factory.
//
// Two kinds of scrape, both routed through ScraperAPI so they work from Railway:
//
//  1. "structured" — ScraperAPI parses the retailer for us and returns clean
//     JSON (Walmart, Target, and other supported marketplaces). Most robust:
//     no selectors to maintain. 1 API call per search term.
//
//  2. "rendered"   — ScraperAPI fetches the retailer's own page/JSON endpoint
//     with a headless browser (render=true), and a per-store parse() pulls
//     products out. For chains with no structured endpoint (Walgreens,
//     Albertsons, Publix, CVS). More fragile; parse() absorbs the site's shape.
//
// makeScraperAdapter() turns a config into a full adapter implementing the
// standard interface, so the registry and runner treat it like any other.

import { ensureStore, upsertProduct, scrapersEnabled } from "./base.js";
import { scrapeJson, scrapeHtml, scraperApiReady } from "./scraperapi.js";

// ---- shared helpers ----------------------------------------------------

function toNumber(v) {
  if (v == null) return null;
  const m = String(v).replace(/[^0-9.]/g, "");
  return m ? Number(m) : null;
}

// Pull the first JSON object assigned to one of the given globals in an HTML
// page (e.g. __NEXT_DATA__, __APP_INITIAL_STATE__). Retailers hydrate their
// React apps from these, so it's the cleanest data in a rendered page.
export function extractEmbeddedJson(html, globals) {
  for (const g of globals) {
    // <script id="__NEXT_DATA__" ...>{...}</script>
    const tag = new RegExp(
      `<script[^>]*id=["']${g}["'][^>]*>(\\{[\\s\\S]*?\\})<\\/script>`,
      "i"
    );
    let m = html.match(tag);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch {
        /* try next */
      }
    }
    // window.__X__ = {...};
    const assign = new RegExp(`${g}\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;`, "i");
    m = html.match(assign);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

// ---- structured-endpoint ingest ---------------------------------------

async function ingestStructured(cfg, { terms, storeId }) {
  let products = 0;
  for (const term of terms) {
    const url = new URL(cfg.structuredUrl);
    url.searchParams.set("api_key", process.env.SCRAPERAPI_KEY);
    url.searchParams.set("query", term);
    url.searchParams.set("country_code", "us");
    if (cfg.tld) url.searchParams.set("tld", cfg.tld);
    let json;
    try {
      // The structured URL is already a ScraperAPI endpoint, so hit it directly.
      const res = await fetch(url, { signal: AbortSignal.timeout(70000) });
      if (!res.ok) continue;
      json = await res.json();
    } catch {
      continue;
    }
    for (const raw of cfg.selectItems(json)) {
      const p = cfg.mapItem(raw);
      if (p == null || p.price == null) continue;
      upsertProduct({ store_id: storeId, ...p });
      products++;
    }
  }
  return { products, coupons: 0 };
}

// ---- rendered-page ingest ----------------------------------------------

async function ingestRendered(cfg, { terms, storeId }) {
  let products = 0;
  for (const term of terms) {
    const target = cfg.searchUrl(term);
    let items = [];
    try {
      if (cfg.expectsJson) {
        const json = await scrapeJson(target, {
          render: cfg.render !== false,
          premium: cfg.premium || false,
          ultra: cfg.ultra || false,
          waitFor: cfg.waitFor || null,
        });
        items = cfg.selectItems(json) || [];
      } else {
        const html = await scrapeHtml(target, {
          render: cfg.render !== false,
          premium: cfg.premium || false,
          ultra: cfg.ultra || false,
          waitFor: cfg.waitFor || null,
        });
        const json = cfg.embeddedGlobals
          ? extractEmbeddedJson(html, cfg.embeddedGlobals)
          : null;
        items = cfg.selectItems(json, html) || [];
      }
    } catch {
      continue; // one term failing shouldn't kill the run
    }
    for (const raw of items) {
      const p = cfg.mapItem(raw);
      if (p == null || p.price == null) continue;
      upsertProduct({ store_id: storeId, ...p });
      products++;
    }
  }
  return { products, coupons: 0 };
}

// ---- factory -----------------------------------------------------------

export function makeScraperAdapter(cfg) {
  return {
    id: cfg.id,
    label: cfg.label,
    kind: "retailer",
    legal: "scraper",
    needsCreds: ["SCRAPERAPI_KEY"],
    available: () => scrapersEnabled() && scraperApiReady(),

    async ingest({ terms = [], storeName = cfg.label } = {}) {
      const storeId = ensureStore(storeName, cfg.policy || {});
      const opts = { terms, storeId };
      return cfg.mode === "structured"
        ? ingestStructured(cfg, opts)
        : ingestRendered(cfg, opts);
    },
  };
}

export { toNumber };
