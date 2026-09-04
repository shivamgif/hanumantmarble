// Relative, not '@/', so the sibling .test.mjs runs under plain node.
import { toSqft } from '../../../lib/stock-sqft.js';

// NUMERIC columns arrive from the Neon driver as strings.
const num = (value) => Number(value) || 0;

function addInto(target, row) {
  target.boxQty += num(row.box_qty);
  target.brokenQty += num(row.broken_qty);
  target.bagQty += num(row.bag_qty);
  target.sqftQty = toSqft(target.sqftQty + toSqft(row.sqft_qty));
  target.revenueExcl += num(row.revenue_excl);
  target.dispatchCount += num(row.dispatch_count);
  return target;
}

const emptyTotals = () => ({ boxQty: 0, brokenQty: 0, bagQty: 0, sqftQty: 0, revenueExcl: 0, dispatchCount: 0 });

// Rank customers by whichever unit the product actually sells in.
const customerWeight = (c) => c.sqftQty || c.bagQty || c.boxQty + c.brokenQty;

/** Flat product x customer rows -> products A-Z, each with its customer breakdown. */
export function groupByProduct(rows) {
  const products = new Map();

  for (const row of rows || []) {
    let product = products.get(row.item_id);
    if (!product) {
      product = {
        itemId: row.item_id,
        itemName: row.item_name || '—',
        sku: row.sku || '',
        unit: row.unit_of_measure || 'box',
        ...emptyTotals(),
        customers: new Map(),
      };
      products.set(row.item_id, product);
    }
    addInto(product, row);

    const name = row.customer_name || '—';
    addInto(product.customers.get(name) || product.customers.set(name, { name, ...emptyTotals() }).get(name), row);
  }

  return [...products.values()]
    .map((p) => ({
      ...p,
      customers: [...p.customers.values()].sort((a, b) => customerWeight(b) - customerWeight(a)),
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName, undefined, { numeric: true, sensitivity: 'base' }));
}
