// ScraperAPI transport.
//
// Routes a request through ScraperAPI's rotating proxy pool so scrapes egress
// from residential IPs instead of Railway's (blocked) datacenter IP. This is
// what makes scraping work from a hosted box at all.
//
// Cost model (API credits per request), so adapters can be deliberate:
//   plain          -> 1 credit
//   render=true    -> 10 credits  (headless browser; the "Playwright fallback")
//   premium=true   -> 10 / 25 with render
//   ultra_premium  -> 30 / 75 with render
// Prefer plain JSON-endpoint scrapes; only reach for render on sites that need
// a real browser. Set SCRAPERAPI_KEY to enable; without it, scraper adapters
// report unavailable.

const ENDPOINT = "https://api.scraperapi.com/";

export function scraperApiReady() {
  return !!process.env.SCRAPERAPI_KEY;
}

// opts:
//   render   - run a headless browser (for JS-only pages). Default false.
//   premium  - residential/mobile IPs for tougher sites. Default false.
//   ultra    - advanced bypass for the hardest sites. Default false.
//   country  - geo, default "us".
//   waitFor  - CSS selector to wait for (requires render).
//   timeoutMs- abort guard. ScraperAPI itself can take a while with render.
export async function scrape(targetUrl, opts = {}) {
  if (!scraperApiReady()) throw new Error("SCRAPERAPI_KEY not set");
  const {
    render = false,
    premium = false,
    ultra = false,
    country = "us",
    waitFor = null,
    timeoutMs = 70000,
  } = opts;

  const u = new URL(ENDPOINT);
  u.searchParams.set("api_key", process.env.SCRAPERAPI_KEY);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("country_code", country);
  if (render) u.searchParams.set("render", "true");
  if (premium) u.searchParams.set("premium", "true");
  if (ultra) u.searchParams.set("ultra_premium", "true");
  if (waitFor && render) u.searchParams.set("wait_for_selector", waitFor);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ScraperAPI ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
    }
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Convenience: fetch a JSON API through the proxy and parse it.
export async function scrapeJson(targetUrl, opts = {}) {
  const res = await scrape(targetUrl, opts);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`ScraperAPI returned non-JSON for ${targetUrl.slice(0, 80)}`);
  }
}

// Convenience: fetch rendered/plain HTML through the proxy.
export async function scrapeHtml(targetUrl, opts = {}) {
  const res = await scrape(targetUrl, opts);
  return res.text();
}
