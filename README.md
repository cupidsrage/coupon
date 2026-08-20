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

## Data sources

`src/lib/sources.js` has a Kroger adapter stub. To go live:

1. Register at developer.kroger.com, get a client id/secret.
2. Set `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` in Railway.
3. Call `ingestKroger({ storeId, locationId, terms })` on a schedule (Railway cron).

Prefer retailer/affiliate APIs over scraping — most coupon and retailer sites forbid scraping in their ToS. Fine as a judgment call for a personal tool; risky for a public deployment.

## Deploy to Railway

1. Push this repo to GitHub, create a Railway project from it.
2. Add a **Volume**, mount it at `/data`, set `DATA_DIR=/data` so the SQLite DB persists across deploys.
3. Railway sets `PORT` automatically. First deploy: run `npm run seed` once from the Railway shell (or remove it once you have real ingestion).

## Next steps

- Wire real ingestion + a Railway cron to refresh prices.
- Add a coupon-entry screen (the `POST /api/coupons` endpoint is ready).
- Add a shopping-list view that sums out-of-pocket across items.
