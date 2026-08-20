import db from "./db.js";

// Find coupons that could apply to a product.
// Match on UPC first (exact), then fall back to brand + fuzzy name contains.
export function couponsForProduct(product) {
  const rows = db
    .prepare(
      `
    SELECT * FROM coupon
    WHERE (expires IS NULL OR date(expires) >= date('now'))
      AND (
        (match_upc IS NOT NULL AND match_upc = @upc)
        OR (brand IS NOT NULL AND @brand IS NOT NULL AND lower(brand) = lower(@brand))
        OR (match_name IS NOT NULL AND instr(lower(@name), lower(match_name)) > 0)
      )
      AND (store_id IS NULL OR store_id = @store_id)
  `
    )
    .all({
      upc: product.upc,
      brand: product.brand,
      name: product.name,
      store_id: product.store_id,
    });
  return rows;
}

export function searchProducts(query, storeId) {
  const like = `%${query}%`;
  return db
    .prepare(
      `
    SELECT * FROM product
    WHERE store_id = @store_id
      AND (name LIKE @like OR brand LIKE @like OR upc = @q)
    ORDER BY (sale_price IS NOT NULL) DESC, name
    LIMIT 50
  `
    )
    .all({ like, q: query, store_id: storeId });
}
