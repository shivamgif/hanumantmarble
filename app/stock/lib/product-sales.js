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

/** Flat product x dispatch rows -> products A-Z, each with its individual sales, newest first. */
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
        sales: [],
      };
      products.set(row.item_id, product);
    }
    addInto(product, row);
    // One row per dispatch: sales stay separate instead of collapsing into a customer total.
    product.sales.push(addInto({
      shipmentId: row.shipment_id,
      name: row.customer_name || '—',
      date: row.sale_date || '',
      ...emptyTotals(),
    }, row));
  }

  return [...products.values()]
    .map((p) => ({ ...p, sales: p.sales.sort((a, b) => String(b.date).localeCompare(String(a.date))) }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName, undefined, { numeric: true, sensitivity: 'base' }));
}
