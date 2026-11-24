// Stock valuation at a date, weighted average cost (Tally's default). Pure —
// no db/session imports — so lib/inventory-valuation.test.mjs pins it.
//
// Quantities come from the documents, not stock_movements (stone sales never
// wrote their square feet there): today's on-hand quantity, with every
// purchase received and every dispatch made after the date rolled back.
// Cost per unit is the weighted average of all purchases received up to the
// date, each line valued as the Purchases ledger books it (discounts, fuel
// and handling folded in; GST included when the supplier gave no ITC).
//
// ponytail: whole stock only. Broken stock is listed by quantity at nil
// value (the conservative valuation); value it if the CA wants it carried.
import { purchaseNoteItems } from './notes.mjs';
import { lineQty } from './gst-invoice.mjs';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/** The unit an item is counted and valued in. */
export const stockCategory = (item) => (item.unit_of_measure === 'sqft' ? 'stone' : item.unit_of_measure === 'bag' ? 'bag' : 'tile');
export const stockUnit = (item) => ({ stone: 'sqft', bag: 'bag', tile: 'box' }[stockCategory(item)]);
const piecesPerBox = (item) => (Number(item.pieces_per_box) > 1 ? Number(item.pieces_per_box) : 1);

/** Whole units on hand now: boxes (with loose pieces as a fraction), bags or square feet. */
export function onHandNow(item) {
  const category = stockCategory(item);
  if (category === 'stone') return Number(item.current_sqft) || 0;
  if (category === 'bag') return Number(item.current_whole_qty) || 0;
  return (Number(item.current_whole_qty) || 0) + (Number(item.current_piece_remainder) || 0) / piecesPerBox(item);
}

/** Units a dispatch line took out for good (loaded less returned), in the item's stock unit. */
export function dispatchedUnits(line, item) {
  const category = stockCategory(item);
  if (category === 'stone') return (Number(line.qty_sqft) || 0) - (Number(line.returned_qty_sqft) || 0);
  const net = (Number(line.loaded_whole_qty) || 0) - (Number(line.returned_whole_qty) || 0);
  return category === 'tile' && line.sell_unit === 'piece' ? net / piecesPerBox(item) : net;
}

/**
 * asOf:            'YYYY-MM-DD' (end of that day)
 * items:           stock_items rows
 * purchases:       [{ date, shipment, claimItc, lines }] — approved; date = when stock came in;
 *                  shipment has the pricing fields, lines are its items joined with
 *                  stock_items (sku, name, unit_of_measure)
 * dispatchLines:   [{ date, item_id, sell_unit, loaded_whole_qty, returned_whole_qty, qty_sqft, returned_qty_sqft }] — approved
 * supplierReturns: [{ date, items }] — approved supplier debit notes that sent goods back (note items)
 * → { rows: [{ itemId, sku, name, unit, qty, broken, unitCost, value }], total, uncosted }
 */
export function valueStock({ asOf, items, purchases = [], dispatchLines = [], supplierReturns = [] }) {
  const after = (date) => String(date).slice(0, 10) > asOf;
  const qty = new Map(items.map((item) => [String(item.id), onHandNow(item)]));
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const cost = new Map();

  for (const purchase of purchases) {
    const priced = purchaseNoteItems({ shipment: purchase.shipment, items: purchase.lines, claimItc: purchase.claimItc });
    purchase.lines.forEach((line, index) => {
      const id = String(line.item_id);
      const received = Number(priced[index].receivedQty) || 0;
      if (after(purchase.date)) {
        if (qty.has(id)) qty.set(id, qty.get(id) - received);
        return;
      }
      const value = Number(priced[index].ratePerUnit) * lineQty(priced[index]);
      if (!(received > 0) || !(value > 0)) return;
      const entry = cost.get(id) || { value: 0, units: 0 };
      cost.set(id, { value: entry.value + value, units: entry.units + received });
    });
  }
  for (const line of dispatchLines) {
    const id = String(line.item_id);
    if (after(line.date) && byId.has(id)) qty.set(id, qty.get(id) + dispatchedUnits(line, byId.get(id)));
  }
  for (const note of supplierReturns) {
    if (!after(note.date)) continue;
    for (const line of note.items) {
      const id = String(line.itemId);
      if (qty.has(id)) qty.set(id, qty.get(id) + lineQty(line));
    }
  }

  const rows = [];
  let total = 0;
  let uncosted = 0;
  for (const item of items) {
    const id = String(item.id);
    const units = r3(Math.max(0, qty.get(id)));
    const broken = Number(item.current_broken_qty) || 0;
    if (!units && !broken) continue;
    const c = cost.get(id);
    const unitCost = c && c.units > 0 ? r2(c.value / c.units) : null;
    const value = unitCost == null ? 0 : r2(units * unitCost);
    if (unitCost == null && units) uncosted += 1;
    total = r2(total + value);
    rows.push({ itemId: Number(item.id), sku: item.sku, name: item.name, unit: stockUnit(item), qty: units, broken, unitCost, value });
  }
  rows.sort((a, b) => b.value - a.value || String(a.sku).localeCompare(String(b.sku)));
  return { rows, total, uncosted };
}
