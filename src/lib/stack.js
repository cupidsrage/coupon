// Stack calculator.
//
// Given a product and the coupons that could apply to it, work out the
// cheapest legal combination and the exact order of operations.
//
// Rules encoded here:
//  - Sale price applies FIRST, before any coupon.
//  - A store may "double" a manufacturer coupon under its double_limit.
//  - You can stack at most one manufacturer + one store/digital coupon per item
//    (the usual real-world limit). Two coupons of the same source don't stack.
//  - A coupon with min_qty > 1 requires buying that many; price is computed per
//    the qty and discount spread back to a per-unit out-of-pocket.
//  - Overage (coupon exceeds price) is capped at the price unless the store
//    allows overage.

const SOURCE_GROUP = { manufacturer: "mfr", store: "store", digital: "store" };

function couponValue(coupon, unitPrice, store) {
  let v;
  if (coupon.disc_type === "percent") {
    v = unitPrice * (coupon.amount / 100);
    if (coupon.max_discount != null) v = Math.min(v, coupon.max_discount);
  } else {
    v = coupon.amount;
    // Doubling only applies to flat manufacturer coupons at/under the limit.
    if (
      store?.doubles &&
      coupon.source === "manufacturer" &&
      coupon.amount <= store.double_limit
    ) {
      v = coupon.amount * 2;
    }
  }
  return v;
}

// Try every legal pairing (0 or 1 from each group) and keep the cheapest.
export function bestStack(product, coupons, store) {
  const basePrice = product.sale_price ?? product.price;
  const onSale = product.sale_price != null && product.sale_price < product.price;

  const groups = { mfr: [], store: [] };
  for (const c of coupons) {
    const g = SOURCE_GROUP[c.source];
    if (g) groups[g].push(c);
  }

  const options = [];
  const mfrChoices = [null, ...groups.mfr];
  const storeChoices = [null, ...groups.store];

  for (const mfr of mfrChoices) {
    for (const st of storeChoices) {
      const applied = [mfr, st].filter(Boolean);
      // Respect non-stackable flags: if either forbids stacking, allow at most one.
      if (applied.length === 2 && applied.some((c) => !c.stackable)) continue;

      const minQty = Math.max(1, ...applied.map((c) => c.min_qty || 1));
      let unitOOP = basePrice;
      const steps = [];

      if (onSale) {
        steps.push({
          label: `Sale price`,
          detail: `${money(product.price)} → ${money(basePrice)}`,
        });
      }

      let totalCouponPerUnit = 0;
      for (const c of applied) {
        // min_qty coupons discount the lot; spread value across the qty.
        const perUnit = couponValue(c, basePrice, store) / (c.min_qty || 1);
        totalCouponPerUnit += perUnit;
        steps.push({
          label: couponLabel(c, store),
          detail: describeCoupon(c, store),
        });
      }

      let finalUnit = unitOOP - totalCouponPerUnit;
      let overage = 0;
      if (finalUnit < 0) {
        overage = -finalUnit;
        finalUnit = store?.allow_overage ? finalUnit : 0;
      }

      options.push({
        unitPrice: Math.max(0, finalUnit),
        overagePerUnit: store?.allow_overage ? overage : 0,
        minQty,
        coupons: applied,
        steps,
        onSale,
        basePrice,
        shelfPrice: product.price,
      });
    }
  }

  options.sort((a, b) => a.unitPrice - b.unitPrice);
  return options[0];
}

function couponLabel(c, store) {
  const doubled =
    store?.doubles &&
    c.source === "manufacturer" &&
    c.disc_type === "flat" &&
    c.amount <= store.double_limit;
  const src =
    c.source === "manufacturer"
      ? "Manufacturer coupon"
      : c.source === "digital"
      ? "Digital coupon"
      : "Store coupon";
  return doubled ? `${src} (doubled)` : src;
}

function describeCoupon(c, store) {
  const face =
    c.disc_type === "percent"
      ? `${c.amount}% off${c.max_discount ? ` (up to ${money(c.max_discount)})` : ""}`
      : `${money(c.amount)} off`;
  const qty = c.min_qty > 1 ? ` when you buy ${c.min_qty}` : "";
  const doubled =
    store?.doubles &&
    c.source === "manufacturer" &&
    c.disc_type === "flat" &&
    c.amount <= store.double_limit
      ? ` → doubles to ${money(c.amount * 2)}`
      : "";
  const rest = c.restrictions ? ` · ${c.restrictions}` : "";
  return `${face}${qty}${doubled}${rest}`;
}

export function money(n) {
  return `$${n.toFixed(2)}`;
}
