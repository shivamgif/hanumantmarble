// Loads for the accounts reports: stock valuation and ledger balances. The
// rules live in lib/inventory-valuation.mjs and lib/financials.mjs.
import { sql } from '@/lib/db';
import { valueStock } from '@/lib/inventory-valuation.mjs';

// When stock actually moved: a purchase on approval, a dispatch on approval.
const PURCHASE_DATE = 'COALESCE(s.approved_at::date, s.invoice_date, s.arrival_date::date)';
const DISPATCH_DATE = 'COALESCE(o.approved_at::date, o.dispatch_date::date)';

/**
 * Stock value at the end of `asOf` (weighted average). Stock is counted per
 * company, not per GSTIN: a company with two businesses sees the whole of it.
 * ponytail: split by branch → business when a company with two GSTINs needs it.
 */
export async function loadStockValuation(asOf) {
  const [items, lines, dispatchLines, supplierReturns] = await Promise.all([
    sql(`SELECT id, sku, name, unit_of_measure, pieces_per_box, current_whole_qty, current_piece_remainder,
                current_broken_qty, current_sqft
         FROM stock_items`),
    sql(
      `SELECT ${PURCHASE_DATE}::text AS date, s.id AS shipment_id, s.discount_amount AS ship_discount, s.fuel_cost_percent,
              s.handling_cost_percent, s.gst_percent, (sup.gst_number IS NOT NULL AND sup.gst_number <> '') AS claim_itc,
              isi.item_id, isi.ordered_qty, isi.received_whole_qty, isi.received_qty_sqft, isi.total_cost, isi.discount_amount,
              isi.hsn_code, i.sku, i.name, i.unit_of_measure
       FROM stock_inbound_shipments s
       JOIN stock_inbound_shipment_items isi ON isi.inbound_shipment_id = s.id
       JOIN stock_items i ON i.id = isi.item_id
       LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
       WHERE s.approval_status = 'approved'
       ORDER BY s.id, isi.id`
    ),
    // Only dispatches after the date matter: they are rolled back into stock.
    sql(
      `SELECT ${DISPATCH_DATE}::text AS date, osi.item_id, osi.sell_unit, osi.loaded_whole_qty, osi.returned_whole_qty,
              osi.qty_sqft, osi.returned_qty_sqft
       FROM stock_outbound_shipments o
       JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = o.id
       WHERE o.approval_status = 'approved' AND ${DISPATCH_DATE} > $1::date`,
      [asOf]
    ),
    sql(
      `SELECT note_date::text AS date, items FROM acc_notes
       WHERE party_kind = 'supplier' AND reason = 'sales_return' AND status = 'approved' AND restock_done AND note_date > $1::date`,
      [asOf]
    ),
  ]);

  const purchases = new Map();
  for (const line of lines) {
    if (!purchases.has(line.shipment_id)) {
      purchases.set(line.shipment_id, {
        date: line.date,
        claimItc: line.claim_itc,
        shipment: {
          discount_amount: line.ship_discount, fuel_cost_percent: line.fuel_cost_percent,
          handling_cost_percent: line.handling_cost_percent, gst_percent: line.gst_percent,
        },
        lines: [],
      });
    }
    purchases.get(line.shipment_id).lines.push(line);
  }
  return valueStock({ asOf, items, purchases: [...purchases.values()], dispatchLines, supplierReturns });
}

/**
 * Every ledger of the business with its posted balance up to `to` (debit +),
 * and, when `from` is given, its movement within [from, to] and balance before `from`.
 */
export async function loadLedgerBalances(businessId, to, from = null) {
  return (await sql(
    `SELECT l.id, l.name, l.group_name,
            COALESCE(SUM(vl.amount) FILTER (WHERE v.voucher_date <= $2::date), 0) AS balance,
            COALESCE(SUM(vl.amount) FILTER (WHERE $3::date IS NOT NULL AND v.voucher_date BETWEEN $3::date AND $2::date), 0) AS movement,
            COALESCE(SUM(vl.amount) FILTER (WHERE $3::date IS NOT NULL AND v.voucher_date < $3::date), 0) AS before
     FROM acc_ledgers l
     LEFT JOIN acc_voucher_lines vl ON vl.ledger_id = l.id
     LEFT JOIN acc_vouchers v ON v.id = vl.voucher_id AND v.status = 'posted'
     WHERE l.business_id = $1
     GROUP BY l.id
     ORDER BY l.group_name, l.name`,
    [businessId, to, from]
  )).map((row) => ({ ...row, balance: Number(row.balance), movement: Number(row.movement), before: Number(row.before) }));
}
