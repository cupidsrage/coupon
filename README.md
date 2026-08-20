# Stackr

Finds and stacks coupons, then tells you exactly how to use them — out-of-pocket price plus the step-by-step order of operations.

## Stack

Node/Express + better-sqlite3, PWA frontend. Same shape as a standard Railway web service.

## Run locally

```bash
npm install
npm run seed     # loads a demo store, products, coupons
npm start        # http://localhost:3000
```

## How it works

- **product / coupon / store** tables (`src/lib/db.js`). Store rows carry policy flags: `doubles`, `double_limit`, `allow_overage`.
- **Matching** (`src/lib/match.js`): coupons attach to a product by UPC, then brand, then fuzzy name.
- **Stack calculator** (`src/lib/stack.js`): the core. Applies sale price first, tries every legal pairing of one manufacturer + one store/digital coupon, handles doubling, percent caps, min-quantity ("$1 off 2"), non-stackable flags, and overage. Returns the cheapest option with human-readable steps.
- **API** (`src/routes/api.js`): `/api/deals`, `/api/search`, `/api/stores`, `POST /api/coupons`.

## Data sources (adapters)

Every source lives in `src/lib/adapters/` behind one interface (`base.js`), so new stores drop in without touching the engine. Each adapter self-declares what creds it needs and whether it can run; the runner skips any that can't.

| Adapter | Path | Auth | Notes |
|---|---|---|---|
| **Kroger** | `adapters/kroger.js` | Official API | OAuth client-credentials; product + promo price per location. Durable. |
| **Target** | `adapters/target.js` | Public Redsky endpoint | Publicly reachable but rotates its web key and IP/captcha-blocks. Gated behind `ENABLE_SCRAPERS`. |
| **Walgreens** | `adapters/walgreens.js` | Official Digital Offers API, else scraper | Uses the partner API when creds exist; falls back to a scraper only if `ENABLE_SCRAPERS=1`. |
| **Aggregator** | `adapters/aggregator.js` | Affiliate feed API | Cross-store coupons under one contract (CouponAPI/CJ/Awin/Impact shape). Needs a real account key. |

### Scraper gate

Target's public endpoint and the Walgreens fallback are **off by default**. Set `ENABLE_SCRAPERS=1` to turn them on. They're fine for a personal tool on your own connection, but they're fragile and ToS-sensitive — leave them off on any shared/public deploy. Everything is polite-fetched (real UA, timeout, inter-request delay).

### Multi-store scraping via ScraperAPI

Six stores — **Walmart, Target, Walgreens, Albertsons, Publix, CVS** — are covered by ScraperAPI-backed scraper adapters. ScraperAPI routes each request through rotating residential IPs, so these run fine from Railway (a plain datacenter IP gets blocked — that's why direct scraping 403s).

One `SCRAPERAPI_KEY` covers all six (free tier = 5,000 credits). They only run when **both** `ENABLE_SCRAPERS=1` and `SCRAPERAPI_KEY` are set; otherwise each skips with a reason.

Two scrape strategies, chosen per store:

- **Structured** (Walmart, Target) — ScraperAPI's `/structured/<store>/search` endpoints return parsed product JSON. Most robust; no HTML selectors to maintain. ~1 credit/term.
- **Rendered** (Walgreens, Albertsons, Publix, CVS) — ScraperAPI fetches the store's own search page with a headless browser (`render=true`, ~10 credits/term), and a defensive parser pulls products from the page's hydration JSON. More fragile; if a site changes shape the run continues and just yields fewer products.

Adding another store is a small config in `src/lib/adapters/stores.js` (id, label, mode, URL, and a `mapItem`) — the factory turns it into a full adapter.

**Credit awareness:** rendered scrapes cost ~10x a structured call. With 10 terms across 4 rendered stores that's ~400 credits/run, so the free tier covers ~12 runs. Tune `TERMS` in `src/ingest.js` and schedule accordingly.

### Running ingestion

- Edit the `jobs` and `TERMS` in `src/ingest.js` to say what to pull.
- `npm run ingest` runs all configured jobs once and prints a per-source report.
- `GET /api/sources` shows what's live; `POST /api/ingest` triggers a refresh (guard it with `INGEST_TOKEN` on public deploys).
- For scheduled refreshes, point a **Railway cron** at `npm run ingest`.

Prefer official/affiliate APIs over scraping wherever you can get access — they're the path that doesn't break.

## Deploy to Railway

1. Push this repo to GitHub, create a Railway project from it.
2. **Node is pinned to 22** (`.nvmrc` + `engines`) so the prebuilt `better-sqlite3` binary is used — no `node-gyp`/Python compile. If Nixpacks ever ignores that, also set `NIXPACKS_NODE_VERSION=22`.
3. Add a **Volume**, mount it at `/data`, set `DATA_DIR=/data` so the SQLite DB persists across deploys.
4. Set source creds (see `.env.example`). Railway sets `PORT` automatically.
5. First deploy: run `npm run seed` once from the Railway shell to see the demo, then `npm run ingest` (or the cron) once real creds are in.

## Next steps

- Wire real ingestion + a Railway cron to refresh prices.
- Add a coupon-entry screen (the `POST /api/coupons` endpoint is ready).
- Add a shopping-list view that sums out-of-pocket across items.
