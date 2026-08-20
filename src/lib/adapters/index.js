// Registry + runner.
//
// Import every adapter, expose the set, and run the ones that can run. The
// runner never throws on a single source: an adapter that lacks creds or is
// gated off is skipped with a reason, so one bad source can't break a refresh.

import kroger from "./kroger.js";
import target from "./target.js";
import walgreens from "./walgreens.js";
import aggregator from "./aggregator.js";
import { scrapersEnabled } from "./base.js";

export const adapters = { kroger, target, walgreens, aggregator };

export function adapterStatus() {
  return Object.values(adapters).map((a) => ({
    id: a.id,
    label: a.label,
    kind: a.kind,
    legal: a.legal,
    available: a.available(),
    needsCreds: a.needsCreds,
    reason: a.available()
      ? null
      : a.needsCreds.length
      ? `missing ${a.needsCreds.filter((c) => !process.env[c]).join(", ")}`
      : a.legal !== "api" && !scrapersEnabled()
      ? "scrapers disabled (set ENABLE_SCRAPERS=1)"
      : "unavailable",
  }));
}

// jobs: [{ adapter: "kroger", opts: {...} }, ...]
export async function runIngest(jobs) {
  const results = [];
  for (const job of jobs) {
    const a = adapters[job.adapter];
    if (!a) {
      results.push({ adapter: job.adapter, error: "unknown adapter" });
      continue;
    }
    if (!a.available()) {
      results.push({ adapter: a.id, skipped: true, ...statusReason(a) });
      continue;
    }
    try {
      const out = await a.ingest(job.opts || {});
      results.push({ adapter: a.id, ok: true, ...out });
    } catch (err) {
      results.push({ adapter: a.id, error: String(err.message || err) });
    }
  }
  return results;
}

function statusReason(a) {
  return {
    reason: a.needsCreds.filter((c) => !process.env[c]).join(", ") || "unavailable",
  };
}
