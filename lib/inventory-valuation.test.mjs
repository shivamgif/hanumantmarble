// Run: node lib/inventory-valuation.test.mjs (also picked up by npm test)
import assert from 'node:assert/strict';
import { dispatchedUnits, onHandNow, valueStock } from './inventory-valuation.mjs';

const tile = { id: 1, sku: 'T1', name: 'Tile', unit_of_measure: 'box', pieces_per_box: 4, current_whole_qty: 30, current_piece_remainder: 2, current_broken_qty: 3 };
const bag = { id: 2, sku: 'C1', name: 'Cement', unit_of_measure: 'bag', current_whole_qty: 50 };
const stone = { id: 3, sku: 'K1', name: 'Kota', unit_of_measure: 'sqft', current_sqft: 100.5 };
const nocost = { id: 4, sku: 'N1', name: 'Never bought', unit_of_measure: 'bag', current_whole_qty: 5 };

assert.equal(onHandNow(tile), 30.5); // 30 boxes + 2 of 4 pieces
assert.equal(onHandNow(stone), 100.5);
assert.equal(dispatchedUnits({ sell_unit: 'piece', loaded_whole_qty: 6, returned_whole_qty: 2 }, tile), 1); // 4 pieces = 1 box
assert.equal(dispatchedUnits({ qty_sqft: 20, returned_qty_sqft: 5 }, stone), 15);

const shipment = (extra = {}) => ({ discount_amount: 0, fuel_cost_percent: 0, handling_cost_percent: 0, gst_percent: 18, ...extra });
const purchases = [
  // 20 boxes for ₹2,000 (₹100/box) and 100 bags for ₹30,000 (₹300/bag), with ITC.
  { date: '2026-10-01', shipment: shipment(), claimItc: true, lines: [
    { item_id: 1, sku: 'T1', name: 'Tile', unit_of_measure: 'box', ordered_qty: 20, received_whole_qty: 20, total_cost: 2000, discount_amount: 0 },
    { item_id: 2, sku: 'C1', name: 'Cement', unit_of_measure: 'bag', ordered_qty: 100, received_whole_qty: 100, total_cost: 30000, discount_amount: 0 },
  ] },
  // 20 more boxes at ₹130 with 5% fuel → ₹136.50/box. Without ITC GST would be in the cost too; here ITC.
  { date: '2026-10-15', shipment: shipment({ fuel_cost_percent: 5 }), claimItc: true, lines: [
    { item_id: 1, sku: 'T1', name: 'Tile', unit_of_measure: 'box', ordered_qty: 20, received_whole_qty: 20, total_cost: 2600, discount_amount: 0 },
  ] },
  // Stone without ITC: ₹40/sqft + 18% GST is all cost → ₹47.20.
  { date: '2026-10-20', shipment: shipment(), claimItc: false, lines: [
    { item_id: 3, sku: 'K1', name: 'Kota', unit_of_measure: 'sqft', received_qty_sqft: 200, total_cost: 8000, discount_amount: 0 },
  ] },
  // Received after the date: rolled back out, and not in the average.
  { date: '2026-11-05', shipment: shipment(), claimItc: true, lines: [
    { item_id: 2, sku: 'C1', name: 'Cement', unit_of_measure: 'bag', ordered_qty: 10, received_whole_qty: 10, total_cost: 5000, discount_amount: 0 },
  ] },
];
const dispatchLines = [
  { date: '2026-11-02', item_id: 2, loaded_whole_qty: 15, returned_whole_qty: 0 },            // after: comes back
  { date: '2026-10-25', item_id: 2, loaded_whole_qty: 40, returned_whole_qty: 0 },            // before: stays out
  { date: '2026-11-03', item_id: 1, sell_unit: 'piece', loaded_whole_qty: 8, returned_whole_qty: 0 }, // 2 boxes back
];
const supplierReturns = [{ date: '2026-11-04', items: [{ itemId: '3', itemCategory: 'stone', qtySqft: 10 }] }];

const v = valueStock({ asOf: '2026-10-31', items: [tile, bag, stone, nocost], purchases, dispatchLines, supplierReturns });
const row = (id) => v.rows.find((r) => r.itemId === id);
// Tile: 30.5 + 2 back = 32.5 boxes at (2,000 + 2,730) / 40 = ₹118.25.
assert.deepEqual([row(1).qty, row(1).unitCost, row(1).value, row(1).broken], [32.5, 118.25, 3843.13, 3]);
// Cement: 50 − 10 received later + 15 dispatched later = 55 bags at ₹300.
assert.deepEqual([row(2).qty, row(2).unitCost, row(2).value], [55, 300, 16500]);
// Kota: 100.5 + 10 sent back later = 110.5 sqft at ₹47.20.
assert.deepEqual([row(3).qty, row(3).unitCost, row(3).value], [110.5, 47.2, 5215.6]);
// Never purchased: counted, not valued, flagged.
assert.deepEqual([row(4).qty, row(4).unitCost, row(4).value], [5, null, 0]);
assert.equal(v.uncosted, 1);
assert.equal(v.total, 25558.73); // 3,843.13 + 16,500 + 5,215.60

// As of today: nothing rolled back; the later cement purchase joins the average.
const now = valueStock({ asOf: '2026-12-31', items: [bag], purchases, dispatchLines });
assert.deepEqual([now.rows[0].qty, now.rows[0].unitCost], [50, 318.18]); // 35,000 / 110

console.log('inventory-valuation: all checks passed');
