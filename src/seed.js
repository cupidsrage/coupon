import db from "./lib/db.js";

// Wipe and seed a demo store so you can see the stack calculator work end to end.
db.exec("DELETE FROM coupon; DELETE FROM product; DELETE FROM store;");

const store = db
  .prepare(
    `INSERT INTO store (name, doubles, double_limit, allow_overage)
     VALUES (?, ?, ?, ?)`
  )
  .run("Demo Market", 1, 1.0, 0);
const storeId = store.lastInsertRowid;

const products = [
  { upc: "001", name: "Tide Pods 42ct", brand: "Tide", size: "42ct", price: 12.99, sale: 9.99 },
  { upc: "002", name: "Colgate Total Toothpaste", brand: "Colgate", size: "4.8oz", price: 4.49, sale: 2.99 },
  { upc: "003", name: "Cheerios Cereal", brand: "Cheerios", size: "18oz", price: 5.29, sale: null },
  { upc: "004", name: "Dawn Dish Soap", brand: "Dawn", size: "19.4oz", price: 3.99, sale: 2.50 },
  { upc: "005", name: "Gillette Razors 4ct", brand: "Gillette", size: "4ct", price: 14.99, sale: 11.99 },
];
const insP = db.prepare(
  `INSERT INTO product (store_id, upc, name, brand, size, price, sale_price)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
for (const p of products)
  insP.run(storeId, p.upc, p.name, p.brand, p.size, p.price, p.sale);

const insC = db.prepare(
  `INSERT INTO coupon
   (source, store_id, brand, match_name, match_upc, disc_type, amount,
    min_qty, max_discount, stackable, restrictions, expires)
   VALUES (@source, @store_id, @brand, @match_name, @match_upc, @disc_type,
    @amount, @min_qty, @max_discount, @stackable, @restrictions, @expires)`
);

const coupons = [
  // Tide: manufacturer $2/1 + store $1/1 -> stacks, on top of sale
  { source: "manufacturer", brand: "Tide", disc_type: "flat", amount: 2.0, restrictions: "42ct or larger" },
  { source: "store", store_id: storeId, brand: "Tide", disc_type: "flat", amount: 1.0 },
  // Colgate: $0.75 manufacturer, doubles under $1 at this store
  { source: "manufacturer", brand: "Colgate", disc_type: "flat", amount: 0.75 },
  // Cheerios: $1 off 2 (min_qty demo)
  { source: "manufacturer", brand: "Cheerios", disc_type: "flat", amount: 1.0, min_qty: 2 },
  // Dawn: 20% digital
  { source: "digital", store_id: storeId, brand: "Dawn", disc_type: "percent", amount: 20 },
  // Gillette: $3 manufacturer, non-stackable
  { source: "manufacturer", brand: "Gillette", disc_type: "flat", amount: 3.0, stackable: false },
];
for (const c of coupons)
  insC.run({
    source: c.source,
    store_id: c.store_id ?? null,
    brand: c.brand ?? null,
    match_name: c.match_name ?? null,
    match_upc: c.match_upc ?? null,
    disc_type: c.disc_type,
    amount: c.amount,
    min_qty: c.min_qty ?? 1,
    max_discount: c.max_discount ?? null,
    stackable: c.stackable === false ? 0 : 1,
    restrictions: c.restrictions ?? null,
    expires: c.expires ?? null,
  });

console.log(`Seeded store #${storeId} with ${products.length} products and ${coupons.length} coupons.`);
