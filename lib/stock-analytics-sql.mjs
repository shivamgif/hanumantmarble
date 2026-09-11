// Shared SQL fragments for the stock analytics routes.
//
// Every revenue, quantity and cost number on the analytics pages is built from
// here so the admin dashboard, a salesperson's own page and the CSV exports
// cannot drift apart again.
//
// The billable-quantity rule mirrors what the invoice actually charges (see
// components/shipment-preview-sheet.js):
//   - stone (unit_of_measure = 'sqft') carries its quantity in qty_sqft and
//     leaves loaded_whole_qty at 0, so it must be read from the sqft columns,
//   - everything else (box / piece / bag) bills whole units only,
//   - broken pieces move stock but are never billed, so they stay out of
//     revenue entirely.
//
// Callers pass the capability object from getStockSchemaCapabilities() so a
// database that predates the stone migration still answers.

// Statuses that never represent a real sale. Drafts matter because
// dispatch_date is NOT NULL DEFAULT NOW(), so an untouched draft would
// otherwise book revenue into the current month.
export function shippedFilter(alias = 's') {
  return `(${alias}.status NOT IN ('draft', 'cancelled') AND ${alias}.approval_status <> 'rejected')`;
}

// Net billable units on one outbound line.
//
// ponytail: stone contributes square feet and tile contributes boxes, so
// summing this across mixed items is only meaningful as "billable units".
// Revenue is the comparable number; sort and rank on that.
export function netUnitsExpr(caps, osi = 'osi', item = 'i') {
  const whole = `GREATEST(COALESCE(${osi}.loaded_whole_qty, 0) - COALESCE(${osi}.returned_whole_qty, 0), 0)`;
  if (!caps.hasStoneSqft) return whole;
  return `(CASE
            WHEN ${item}.unit_of_measure = 'sqft'
              THEN GREATEST(COALESCE(${osi}.qty_sqft, 0) - COALESCE(${osi}.returned_qty_sqft, 0), 0)
            ELSE ${whole}
          END)`;
}

export function netRevenueExpr(caps, osi = 'osi', item = 'i') {
  return `(${netUnitsExpr(caps, osi, item)} * COALESCE(${osi}.rate_per_unit, 0))`;
}

// On-hand quantity for one stock item, in the same unit the item sells in.
export function availableQtyExpr(caps, item = 'i') {
  const whole = `(COALESCE(${item}.current_whole_qty, 0) + COALESCE(${item}.current_broken_qty, 0))`;
  if (!caps.hasStoneSqft) return whole;
  return `(CASE
            WHEN ${item}.unit_of_measure = 'sqft' THEN COALESCE(${item}.current_sqft, 0)
            ELSE ${whole}
          END)`;
}

// Moving-average purchase cost per billable unit, from what was actually
// received and priced.
//
// stock_items.landed_cost is not usable for this: it is written per square
// metre for tile lines (ordered_qty_sqm basis) but multiplied against box
// counts downstream, and it is simply absent for items never repriced. Deriving
// the cost from receipts keeps the numerator and denominator in the same unit.
// Items with no priced receipt get no row here at all, which is deliberate -
// the caller reports their revenue as uncosted rather than assuming zero cost.
export function unitCostCte(caps, name = 'unit_cost') {
  const receivedUnits = caps.hasStoneSqft
    ? `CASE
         WHEN i.unit_of_measure = 'sqft' THEN COALESCE(isi.received_qty_sqft, 0)
         ELSE COALESCE(isi.received_whole_qty, 0) + COALESCE(isi.received_broken_qty, 0)
       END`
    : `COALESCE(isi.received_whole_qty, 0) + COALESCE(isi.received_broken_qty, 0)`;

  return `${name} AS (
    SELECT
      isi.item_id,
      SUM(COALESCE(isi.total_cost, 0)) / NULLIF(SUM(${receivedUnits}), 0) AS cost_per_unit
    FROM stock_inbound_shipment_items isi
    JOIN stock_inbound_shipments ins ON ins.id = isi.inbound_shipment_id
    JOIN stock_items i ON i.id = isi.item_id
    WHERE ins.approval_status = 'approved'
      AND COALESCE(isi.total_cost, 0) > 0
    GROUP BY isi.item_id
    HAVING SUM(${receivedUnits}) > 0
  )`;
}

// A salesperson owns a dispatch when they are named on it, or when nobody is
// named and they filed it. Both the admin goal tracker and the salesperson's
// own page must use this or the two pages disagree about the same person.
export function ownershipFilter(caps, alias = 's', param = '$1') {
  return caps.hasOutboundSalespersonUserId
    ? `(${alias}.salesperson_user_id = ${param} OR (${alias}.salesperson_user_id IS NULL AND ${alias}.submitted_by_user_id = ${param}))`
    : `${alias}.submitted_by_user_id = ${param}`;
}

// How much of the range's final month has actually happened.
//
// The last bucket of every range is the month the viewer is standing in, so it
// holds a few days of data. Anything that compares it against a full prior
// month has to either drop it or prorate the comparison, or a healthy month
// reads as a collapse on the 3rd. `now` is injectable so this is testable.
export function monthProgress(endDate, now = new Date()) {
  const isCurrentMonth =
    endDate.getUTCFullYear() === now.getUTCFullYear() && endDate.getUTCMonth() === now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  return {
    partialLastMonth: isCurrentMonth,
    // 1 for a month that is over, otherwise the fraction elapsed.
    elapsedFraction: isCurrentMonth ? now.getUTCDate() / daysInMonth : 1,
  };
}

// Cost and margin for any revenue query that groups rows and LEFT JOINs the
// unitCostCte() output. Kept here because the leaderboard, the customer table
// and the CSV export must all answer the same way about the same person.
//
// A line whose item has no priced receipt cannot be costed. Its revenue is
// summed separately and dropped from the margin denominator, rather than
// counted as pure profit - the same rule the monthly profit chart uses.
export function marginAggregates(caps, osi = 'osi', item = 'i', uc = 'uc') {
  const revenue = netRevenueExpr(caps, osi, item);
  const units = netUnitsExpr(caps, osi, item);
  return `COALESCE(SUM(${revenue}) FILTER (WHERE ${uc}.cost_per_unit IS NULL), 0)::numeric(14,2) AS uncosted_revenue,
          COALESCE(SUM(${units} * ${uc}.cost_per_unit) FILTER (WHERE ${uc}.cost_per_unit IS NOT NULL), 0)::numeric(14,2) AS cost`;
}

// Gross profit and margin % from the columns marginAggregates() produced.
// Postgres cannot see an alias from the same SELECT, so this only goes in an
// outer query that reads them as plain columns.
//
// margin_pct is NULL, not 0, when nothing costable sold: no denominator means
// no answer, and a zero would rank an unknown below a genuine loss.
export function marginColumns(revenue = 'revenue', uncosted = 'uncosted_revenue', cost = 'cost') {
  const costed = `(${revenue} - ${uncosted})`;
  const profit = `(${revenue} - ${uncosted} - ${cost})`;
  return `${profit}::numeric(14,2) AS gross_profit,
          (CASE WHEN ${costed} > 0 THEN ROUND((${profit} / ${costed}) * 100, 1) ELSE NULL END)::numeric(6,1) AS margin_pct`;
}
