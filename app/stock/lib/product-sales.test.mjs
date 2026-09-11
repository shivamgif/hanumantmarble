// Run: node app/stock/lib/product-sales.test.mjs
import assert from 'node:assert/strict';
import { groupByProduct } from './product-sales.js';

// One row per dispatch — including two separate sales to the same customer, which must stay separate.
// NUMERIC columns come back from the driver as strings — that is the point of the coercion.
const rows = [
  { item_id: 2, item_name: 'Birla Cement', sku: 'BC-50', unit_of_measure: 'bag', customer_name: 'Verma Enterprises', shipment_id: 11, sale_date: '2026-09-04', box_qty: '0', broken_qty: '0', bag_qty: '95', sqft_qty: '0', revenue_excl: '38000.00', dispatch_count: 1 },
  { item_id: 1, item_name: 'Apollo Ivory 600', sku: 'AI-600', unit_of_measure: 'box', customer_name: 'Sharma Traders', shipment_id: 12, sale_date: '2026-09-02', box_qty: '60', broken_qty: '3', bag_qty: '0', sqft_qty: '0', revenue_excl: '25200.50', dispatch_count: 1 },
  { item_id: 2, item_name: 'Birla Cement', sku: 'BC-50', unit_of_measure: 'bag', customer_name: 'Sharma Traders', shipment_id: 13, sale_date: '2026-09-09', box_qty: '0', broken_qty: '0', bag_qty: '120', sqft_qty: '0', revenue_excl: '48000.00', dispatch_count: 1 },
  { item_id: 3, item_name: 'Granite Black', sku: 'GB-18', unit_of_measure: 'sqft', customer_name: '—', shipment_id: 14, sale_date: '2026-09-07', box_qty: '0', broken_qty: '0', bag_qty: '0', sqft_qty: '1204.125', revenue_excl: '54185.63', dispatch_count: 1 },
  { item_id: 1, item_name: 'Apollo Ivory 600', sku: 'AI-600', unit_of_measure: 'box', customer_name: 'Sharma Traders', shipment_id: 15, sale_date: '2026-09-06', box_qty: '52', broken_qty: '0', bag_qty: '0', sqft_qty: '0', revenue_excl: '20800.00', dispatch_count: 1 },
];

const grouped = groupByProduct(rows);

// Products alphabetical regardless of row order.
assert.deepEqual(grouped.map((p) => p.itemName), ['Apollo Ivory 600', 'Birla Cement', 'Granite Black']);

// Per-unit totals stay in their own bucket: a bag never lands in a box total.
const [apollo, birla, granite] = grouped;
assert.equal(apollo.boxQty, 112);
assert.equal(apollo.brokenQty, 3);
assert.equal(apollo.bagQty, 0);
assert.equal(birla.bagQty, 215);
assert.equal(birla.boxQty, 0);
assert.equal(granite.sqftQty, 1204.125);

// Strings summed as numbers, not concatenated.
assert.equal(apollo.revenueExcl, 46000.5);
assert.equal(apollo.dispatchCount, 2);

// Two sales to the same customer stay two rows — this is the whole point.
assert.equal(apollo.sales.length, 2);
assert.deepEqual(apollo.sales.map((s) => s.name), ['Sharma Traders', 'Sharma Traders']);

// Newest sale first, each carrying its own date and quantities.
assert.deepEqual(apollo.sales.map((s) => s.date), ['2026-09-06', '2026-09-02']);
assert.deepEqual(apollo.sales.map((s) => s.boxQty), [52, 60]);
assert.deepEqual(birla.sales.map((s) => s.date), ['2026-09-09', '2026-09-04']);

// Sales still sum to the product total.
assert.equal(apollo.sales.reduce((sum, s) => sum + s.boxQty, 0), apollo.boxQty);
assert.equal(birla.sales.reduce((sum, s) => sum + s.bagQty, 0), birla.bagQty);

// Missing customer keeps the em-dash placeholder rather than collapsing rows.
assert.deepEqual(granite.sales.map((s) => s.name), ['—']);

// Empty / nullish input is not an error.
assert.deepEqual(groupByProduct([]), []);
assert.deepEqual(groupByProduct(null), []);

console.log('product-sales: all assertions passed');
