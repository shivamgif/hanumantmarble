// Fractional-quantity helpers for stone items (Kota etc), which are bought and
// sold by total square feet rather than by countable pieces.
//
// Why stone can't reuse current_whole_qty: that column is INTEGER, and stone
// consignments arrive at a fixed size that differs every delivery, so a "piece"
// is not a stable unit for the item — only total sqft is. Stone therefore gets
// its own NUMERIC column (stock_items.current_sqft).
//
// NUMERIC arrives from node-postgres as a STRING (lib/db.js sets no type
// parser), so every value crossing this boundary goes through toSqft() before
// arithmetic. Never do bare `+` on a raw NUMERIC column value.

// Stored scale is NUMERIC(14,3) — 3 decimals, matching the existing qty_sqm
// columns. Round on every write so repeated float sums can't drift a paise.
const SCALE = 1000;

export function toSqft(value) {
  const x = Number(value);
  return Number.isFinite(x) ? Math.round(x * SCALE) / SCALE : 0;
}


// Line total for a stone row: sqft x rate, rounded to paise.
export function sqftLineTotal(qtySqft, ratePerSqft) {
  return Number((toSqft(qtySqft) * Number(ratePerSqft || 0)).toFixed(2));
}

// Parse a user-entered sqft quantity. Returns 0 for blank/invalid/negative so
// callers can reject with a single `=== 0` check, mirroring toPositiveInteger()
// in the outbound route.
export function toPositiveSqft(value) {
  if (value == null || value === '') return 0;
  const x = toSqft(value);
  return x > 0 ? x : 0;
}

// Guard for issuing stone out of stock. Returns the rounded qty to decrement,
// or throws with the same message shape the piece/box paths use.
export function assertSqftAvailable({ requested, available, sku }) {
  const need = toSqft(requested);
  const have = toSqft(available);
  if (need > have) {
    throw new Error(`Insufficient stock for ${sku}: need ${need} sqft, have ${have}`);
  }
  return need;
}

// ponytail: stone tracks whole stock only — no broken/chipped sqft bucket,
// because broken columns are INTEGER too and nobody has asked to sell chipped
// kota separately. Add a current_broken_sqft NUMERIC alongside if that changes.
