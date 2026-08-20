import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Railway gives you a persistent volume; point DATA_DIR at its mount path.
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "stackr.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS store (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  -- policy flags that drive the stack calculator
  doubles      INTEGER NOT NULL DEFAULT 0,   -- doubles coupons under threshold
  double_limit REAL    NOT NULL DEFAULT 0,   -- max face value that doubles (e.g. 1.00)
  allow_overage INTEGER NOT NULL DEFAULT 0   -- coupon value beyond price becomes credit
);

CREATE TABLE IF NOT EXISTS product (
  id      INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES store(id),
  upc     TEXT,
  name    TEXT NOT NULL,
  brand   TEXT,
  size    TEXT,
  -- shelf price and current sale price (null sale = not on sale)
  price      REAL NOT NULL,
  sale_price REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_name ON product(name);
CREATE INDEX IF NOT EXISTS idx_product_upc  ON product(upc);

CREATE TABLE IF NOT EXISTS coupon (
  id          INTEGER PRIMARY KEY,
  source      TEXT NOT NULL,               -- 'manufacturer' | 'store' | 'digital'
  store_id    INTEGER REFERENCES store(id),-- null for manufacturer coupons
  brand       TEXT,
  match_name  TEXT,                        -- text used to match products
  match_upc   TEXT,
  disc_type   TEXT NOT NULL,               -- 'flat' | 'percent'
  amount      REAL NOT NULL,               -- 1.50 or 20 (percent)
  min_qty     INTEGER NOT NULL DEFAULT 1,  -- "$1 off 2" -> min_qty=2
  max_discount REAL,                       -- cap for percent / "up to"
  stackable   INTEGER NOT NULL DEFAULT 1,  -- can combine with another source
  restrictions TEXT,                       -- free text shown to the user
  expires     TEXT
);
CREATE INDEX IF NOT EXISTS idx_coupon_brand ON coupon(brand);
CREATE INDEX IF NOT EXISTS idx_coupon_upc   ON coupon(match_upc);
`);

export default db;
