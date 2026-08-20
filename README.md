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
