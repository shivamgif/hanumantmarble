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

// Who may be attributed a sale — the SQL half of canSell() in lib/stock-roles.mjs.
//
// The dropdown queries, the dispatch validator and the goal tracker must agree
// on this set, or a name offered in the dropdown 400s on submit, or sells and
// then never shows up on the leaderboard.
export function sellerFilter(caps, alias = 'u') {
  return caps.hasUserCanSell
    ? `(${alias}.role = 'salesperson' OR ${alias}.can_sell = TRUE)`
    : `${alias}.role = 'salesperson'`;
}

const IST_NOW = `(NOW() AT TIME ZONE 'Asia/Kolkata')`;

// Last month, cut off at today's day-of-month. Comparing the month so far with
// all of last month reads as a collapse on the 5th; this is the fair baseline.
// dispatch_date is not IST-shifted here, to match the goal tracker's own month.
export function lastMonthToDateFilter(col) {
  return `(DATE_TRUNC('month', ${col}) = DATE_TRUNC('month', ${IST_NOW} - INTERVAL '1 month')
    AND EXTRACT(DAY FROM ${col}) <= EXTRACT(DAY FROM ${IST_NOW}))`;
}

// Every seller with a goal: this month's revenue so far, and the same slice of
// last month. The admin goal tracker and a salesperson's own rank both read
// this, so the tracker and the rank card cannot disagree about anyone.
export function goalProgressSql(caps) {
  const revenue = netRevenueExpr(caps, 'osi', 'i');
  const thisMonth = `DATE_TRUNC('month', o.dispatch_date) = DATE_TRUNC('month', ${IST_NOW})`;
  const lastMtd = lastMonthToDateFilter('o.dispatch_date');
  return `WITH actual AS (
      SELECT
        u.id AS uid,
        COALESCE(SUM(${revenue}) FILTER (WHERE ${thisMonth}), 0) AS rev,
        COUNT(DISTINCT o.id) FILTER (WHERE ${thisMonth}) AS shipments,
        COALESCE(SUM(${revenue}) FILTER (WHERE ${lastMtd}), 0) AS last_mtd_rev
      FROM stock_app_users u
      JOIN stock_outbound_shipments o ON ${ownershipFilter(caps, 'o', 'u.id')}
      LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = o.id
      LEFT JOIN stock_items i ON i.id = osi.item_id
      WHERE (${thisMonth} OR ${lastMtd})
        AND ${shippedFilter('o')}
      GROUP BY u.id
    )
    SELECT
      u.id,
      u.name,
      u.monthly_sales_goal::numeric(14,2) AS goal,
      COALESCE(a.rev, 0)::numeric(14,2) AS actual,
      COALESCE(a.shipments, 0)::int AS shipments,
      COALESCE(a.last_mtd_rev, 0)::numeric(14,2) AS last_mtd_rev
    FROM stock_app_users u
    LEFT JOIN actual a ON a.uid = u.id
    WHERE ${sellerFilter(caps, 'u')} AND u.monthly_sales_goal IS NOT NULL AND u.monthly_sales_goal > 0
    ORDER BY (COALESCE(a.rev, 0) / u.monthly_sales_goal) DESC`;
}

// One seller's standing among goalProgressSql() rows, ranked by % of goal so a
// smaller territory can still take #1. Only the caller's own figures leave
// here: gaps are converted into the caller's rupees, never anyone else's.
// Ties share a position. null when the caller has no goal (not ranked).
export function rankAmong(rows, userId) {
  const people = rows.map((r) => ({
    id: Number(r.id),
    goal: Number(r.goal),
    pct: Number(r.actual) / Number(r.goal),
    growth: Number(r.last_mtd_rev) > 0 ? (Number(r.actual) - Number(r.last_mtd_rev)) / Number(r.last_mtd_rev) : null,
  }));
  const me = people.find((p) => p.id === Number(userId));
  if (!me) return null;
  const others = people.filter((p) => p !== me);
  const above = others.filter((p) => p.pct > me.pct);
  const below = others.filter((p) => p.pct <= me.pct);
  const nextUp = above.length ? Math.min(...above.map((p) => p.pct)) : null;
  const nextDown = below.length ? Math.max(...below.map((p) => p.pct)) : null;
  const bestGrowth = Math.max(...others.map((p) => p.growth ?? -Infinity), -Infinity);
  return {
    position: above.length + 1,
    total: people.length,
    gapToNext: nextUp === null ? null : Math.round((nextUp - me.pct) * me.goal),
    leadOverNext: nextUp === null && nextDown !== null ? Math.round((me.pct - nextDown) * me.goal) : null,
    mostImproved: people.length > 1 && me.growth !== null && me.growth > 0 && me.growth > bestGrowth,
  };
}

// A salesperson's five dead items most worth a sales call, biggest money first.
// Of the dead stock, only what is idle for `staleDays`, or still holding more
// than its reorder level, makes the cut (a couple of boxes left over is not
// worth pushing). $1 is the division id array. Ranked by what it cost to buy,
// but cost is never selected: a salesperson who can read purchase prices can
// read the margin on every quote.
export function sellFirstSql(caps, { limit = 5, staleDays = 90 } = {}) {
  const available = availableQtyExpr(caps, 'i');
  return `WITH ${unitCostCte(caps)}
    SELECT
      i.id,
      i.name,
      i.unit_of_measure,
      b.name AS brand_name,
      d.name AS division_name,
      sz.label AS size_label,
      ${available}::numeric(14,3) AS available_qty,
      (SELECT TO_CHAR(MAX(o.dispatch_date), 'YYYY-MM-DD')
         FROM stock_outbound_shipment_items osi
         JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
        WHERE osi.item_id = i.id AND ${shippedFilter('o')}) AS last_sold_on,
      (CURRENT_DATE - (${idleSinceExpr(caps, 'i')})::date)::int AS days_idle
    FROM stock_items i
    LEFT JOIN stock_brands b ON b.id = i.brand_id
    LEFT JOIN stock_divisions d ON d.id = i.division_id
    LEFT JOIN stock_sizes sz ON sz.id = i.size_id
    LEFT JOIN unit_cost uc ON uc.item_id = i.id
    WHERE ${idleStockWhere(caps, 'i')}
      AND i.division_id = ANY($1::bigint[])
      AND (
        (${idleSinceExpr(caps, 'i')}) < NOW() - INTERVAL '${Number(staleDays)} days'
        OR ${available} > COALESCE(i.reorder_level, 0)
      )
    ORDER BY (${available} * uc.cost_per_unit) DESC NULLS LAST, days_idle DESC
    LIMIT ${Number(limit)}`;
}

export function sellFirstItem(row) {
  return {
    id: Number(row.id),
    name: row.name,
    unitOfMeasure: row.unit_of_measure,
    brandName: row.brand_name,
    divisionName: row.division_name,
    sizeLabel: row.size_label,
    availableQty: Number(row.available_qty),
    lastSoldOn: row.last_sold_on,
    daysIdle: Number(row.days_idle),
  };
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

// How long an item may sit in stock without a dispatch before it counts as dead.
export const IDLE_STOCK_DAYS = 60;

// When an item last did anything: its last real dispatch, or if it has never
// sold, the day it first arrived. Measuring from arrival is the point. "No
// dispatch in 60 days" alone counts last week's delivery as dead stock, and a
// salesperson told to push stock that landed ten days ago stops trusting the list.
export function idleSinceExpr(caps, item = 'i') {
  return `COALESCE(
    (SELECT MAX(idle_s.dispatch_date)
       FROM stock_outbound_shipment_items idle_osi
       JOIN stock_outbound_shipments idle_s ON idle_s.id = idle_osi.outbound_shipment_id
      WHERE idle_osi.item_id = ${item}.id
        AND ${shippedFilter('idle_s')}),
    (SELECT MIN(idle_in.arrival_date)
       FROM stock_inbound_shipment_items idle_isi
       JOIN stock_inbound_shipments idle_in ON idle_in.id = idle_isi.inbound_shipment_id
      WHERE idle_isi.item_id = ${item}.id
        AND idle_in.approval_status = 'approved'),
    ${item}.created_at
  )`;
}

// Active, in stock, and idle for IDLE_STOCK_DAYS. Shared by the admin dead stock
// total and the salesperson's "sell these first" list, so the list a salesperson
// works through adds up to the figure the owner sees.
export function idleStockWhere(caps, item = 'i') {
  return `(${item}.is_active = TRUE
    AND ${availableQtyExpr(caps, item)} > 0
    AND ${idleSinceExpr(caps, item)} < NOW() - INTERVAL '${IDLE_STOCK_DAYS} days')`;
}

// Freight keyed more than once for the same truck on the same day.
//
// Both fragments go in a query grouping trips by truck-day, where `freight` is
// one trip's total charge. The earlier rule asked whether every trip in the
// group carried the same figure (COUNT(DISTINCT freight) = 1), which went
// silent the moment one invoice on the lorry had a different charge - so
// UP 83 BT 5196 carrying Rs 38,665 five times over alongside one Rs 14,275
// reported nothing at all. Comparing the counts instead catches a figure
// repeated inside a mixed group, and matches the old answer on a uniform one.
export function freightRepeatFlagExpr(freight = 'freight') {
  return `(COUNT(*) > COUNT(DISTINCT ${freight}) AND MAX(${freight}) > 0)`;
}

// What the repeats cost: everything booked, less one of each distinct figure.
//
// NULL rather than 0 when nothing repeats, so a row with no duplicate sorts
// last and the UI can tell "no repeat" from "a repeat worth nothing".
//
// ponytail: two genuinely separate deliveries by one truck on one day that cost
// exactly the same rupee amount read as a repeat here. Naming that in the tab's
// note is cheaper than a rule that could tell them apart, and erring toward
// flagging is the right direction for money already on the books.
export function freightRepeatedAmountExpr(freight = 'freight') {
  return `NULLIF(SUM(${freight}) - SUM(DISTINCT ${freight}), 0)`;
}
