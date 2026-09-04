// Run: node app/stock/lib/product-sales.test.mjs
import assert from 'node:assert/strict';
import { groupByProduct } from './product-sales.js';

// Mixed units, two customers, deliberately out of alphabetical order.
// NUMERIC columns come back from the driver as strings — that is the point of the coercion.
const rows = [
  { item_id: 2, item_name: 'Birla Cement', sku: 'BC-50', unit_of_measure: 'bag', customer_name: 'Verma Enterprises', box_qty: '0', broken_qty: '0', bag_qty: '95', sqft_qty: '0', revenue_excl: '38000.00', dispatch_count: 2 },
  { item_id: 1, item_name: 'Apollo Ivory 600', sku: 'AI-600', unit_of_measure: 'box', customer_name: 'Sharma Traders', box_qty: '60', broken_qty: '3', bag_qty: '0', sqft_qty: '0', revenue_excl: '25200.50', dispatch_count: 3 },
  { item_id: 2, item_name: 'Birla Cement', sku: 'BC-50', unit_of_measure: 'bag', customer_name: 'Sharma Traders', box_qty: '0', broken_qty: '0', bag_qty: '120', sqft_qty: '0', revenue_excl: '48000.00', dispatch_count: 1 },
  { item_id: 3, item_name: 'Granite Black', sku: 'GB-18', unit_of_measure: 'sqft', customer_name: '—', box_qty: '0', broken_qty: '0', bag_qty: '0', sqft_qty: '1204.125', revenue_excl: '54185.63', dispatch_count: 1 },
  { item_id: 1, item_name: 'Apollo Ivory 600', sku: 'AI-600', unit_of_measure: 'box', customer_name: 'Verma Enterprises', box_qty: '52', broken_qty: '0', bag_qty: '0', sqft_qty: '0', revenue_excl: '20800.00', dispatch_count: 1 },
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
assert.equal(apollo.dispatchCount, 4);

// Customers ranked by the unit the product actually sells in, and they sum to the product total.
assert.deepEqual(apollo.customers.map((c) => c.name), ['Sharma Traders', 'Verma Enterprises']);
assert.deepEqual(birla.customers.map((c) => c.name), ['Sharma Traders', 'Verma Enterprises']);
assert.equal(birla.customers.reduce((sum, c) => sum + c.bagQty, 0), birla.bagQty);
assert.equal(apollo.customers.reduce((sum, c) => sum + c.boxQty, 0), apollo.boxQty);

// Missing customer keeps the em-dash placeholder rather than collapsing rows.
assert.deepEqual(granite.customers.map((c) => c.name), ['—']);

// Empty / nullish input is not an error.
assert.deepEqual(groupByProduct([]), []);
assert.deepEqual(groupByProduct(null), []);

console.log('product-sales: all assertions passed');
