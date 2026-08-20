// Ingest jobs config + CLI entrypoint.
//
// Edit `jobs` to say what to pull. Run manually with `npm run ingest`, or wire
// this file to a Railway cron for scheduled refreshes. Adapters that can't run
// are skipped and reported, so it's safe to list all of them.

import { runIngest } from "./lib/adapters/index.js";

// Common household terms couponers care about. Tune freely.
const TERMS = [
  "laundry detergent", "toothpaste", "dish soap", "razors", "shampoo",
  "paper towels", "cereal", "coffee", "deodorant", "body wash",
];

export const jobs = [
  { adapter: "kroger", opts: { locationId: process.env.KROGER_LOCATION_ID || "01400943", terms: TERMS } },
  { adapter: "target", opts: { storeId: process.env.TARGET_STORE_ID || "1375", terms: TERMS } },
  { adapter: "walgreens", opts: {} },
  { adapter: "aggregator", opts: {} },
  // ScraperAPI-backed store scrapers (only run when ENABLE_SCRAPERS=1 and
  // SCRAPERAPI_KEY is set; otherwise skipped with a reason).
  { adapter: "walmart", opts: { terms: TERMS } },
  { adapter: "target-scraper", opts: { terms: TERMS } },
  { adapter: "walgreens-scraper", opts: { terms: TERMS } },
  { adapter: "albertsons", opts: { terms: TERMS } },
  { adapter: "publix", opts: { terms: TERMS } },
  { adapter: "cvs", opts: { terms: TERMS } },
];

// Run when invoked directly (node src/ingest.js).
if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await runIngest(jobs);
  console.log(JSON.stringify(results, null, 2));
  const totals = results.reduce(
    (t, r) => ({
      products: t.products + (r.products || 0),
      coupons: t.coupons + (r.coupons || 0),
    }),
    { products: 0, coupons: 0 }
  );
  console.log(`\nTotal: ${totals.products} products, ${totals.coupons} coupons ingested.`);
}
