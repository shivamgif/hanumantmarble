import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import {
  availableQtyExpr,
  netRevenueExpr,
  monthProgress,
  netUnitsExpr,
  marginAggregates,
  marginColumns,
  shippedFilter,
  unitCostCte,
} from '@/lib/stock-analytics-sql.mjs';

function toDateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeRange(searchParams) {
  const rangeMonths = clampNumber(searchParams.get('months'), 1, 24, 6);
  const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')) : new Date();

  if (Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid endDate query param');
  }

  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - (rangeMonths - 1), 1));
  const normalizedEnd = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  const lastBucket = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  return {
    months: rangeMonths,
    startDate,
    endDate: normalizedEnd,
    lastBucket,
    ...monthProgress(endDate),
  };
}

// Below this many dispatches an item's median rate is an anecdote, not a price.
const MIN_PRICED_SALES = 5;

const CACHE_TTL_MS = 5 * 60 * 1000;
const analyticsCache = new Map();

function cacheGet(key) {
  const entry = analyticsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    analyticsCache.delete(key);
    return null;
  }
  return entry.payload;
}

function cacheSet(key, payload) {
  analyticsCache.set(key, { ts: Date.now(), payload });
  if (analyticsCache.size > 64) {
    const oldest = [...analyticsCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) analyticsCache.delete(oldest[0]);
  }
}

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session || !hasAnyStockRole(appUser, ['admin', 'manager', 'read_only_admin'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const { searchParams: searchParamsForCache } = new URL(request.url);
    const months = clampNumber(searchParamsForCache.get('months'), 1, 24, 6);
    const endDateParam = searchParamsForCache.get('endDate') || '';
    const fresh = searchParamsForCache.get('fresh');
    const cacheKey = `admin:${months}:${endDateParam}`;
    if (!fresh) {
      const cached = cacheGet(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, _cache: 'hit' });
      }
    }

    const schemaCaps = await getStockSchemaCapabilities();
    const salespersonLabelExpr = schemaCaps.hasOutboundSalespersonUserId
      ? `COALESCE(spu.name, sp.name, 'Unassigned')`
      : `COALESCE(sp.name, 'Unassigned')`;
    const salespersonUserJoin = schemaCaps.hasOutboundSalespersonUserId
      ? `LEFT JOIN stock_app_users spu ON spu.id = s.salesperson_user_id`
      : '';
    // A salesperson owns a dispatch when they are named on it, or when nobody
    // is named and they filed it. Matches /api/stock/salesperson-analytics so
    // the goal tracker and a salesperson's own page agree.
    const goalOwnership = schemaCaps.hasOutboundSalespersonUserId
      ? `(o.salesperson_user_id = u.id OR (o.salesperson_user_id IS NULL AND o.submitted_by_user_id = u.id))`
      : `o.submitted_by_user_id = u.id`;

    const netRevenue = netRevenueExpr(schemaCaps, 'osi', 'i');
    const netUnits = netUnitsExpr(schemaCaps, 'osi', 'i');
    const availableQty = availableQtyExpr(schemaCaps, 'i');
    const outboundShipped = shippedFilter('s');
    const outboundShippedO = shippedFilter('o');

    const { searchParams } = new URL(request.url);
    const range = normalizeRange(searchParams);
    const startDate = toDateOnly(range.startDate);
    const endDate = toDateOnly(range.endDate);
    const lastBucket = toDateOnly(range.lastBucket);
    const elapsedFraction = range.elapsedFraction;

    const [
      dispatchTrend,
      inboundTrend,
      divisionRisk,
      salespersonTrend,
      salespersonRanking,
      divisionPerformance,
      approvalOps,
      stockRisk,
      reorderNowRows,
      deadStockRow,
      pendingQueueRows,
      salespersonGoalRows,
      customerConcentrationRows,
      activityFeedRows,
      abcItemRows,
      monthlyProfitRows,
      priceDispersionRows,
    ] = await Promise.all([
      // Outbound activity per month: how many dispatches went out and what they
      // billed. Draft, cancelled and rejected shipments are excluded - a draft
      // would otherwise book revenue, because dispatch_date defaults to NOW().
      sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS bucket
         ), dispatch_value AS (
           SELECT
             osi.outbound_shipment_id,
             SUM(${netRevenue}) AS revenue
           FROM stock_outbound_shipment_items osi
           JOIN stock_items i ON i.id = osi.item_id
           GROUP BY osi.outbound_shipment_id
         ), dispatches AS (
           SELECT
             date_trunc('month', s.dispatch_date)::date AS bucket,
             s.status,
             COALESCE(dv.revenue, 0) AS revenue
           FROM stock_outbound_shipments s
           LEFT JOIN dispatch_value dv ON dv.outbound_shipment_id = s.id
           WHERE s.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShipped}
         )
         SELECT
           p.bucket,
           COUNT(d.*)::int AS total,
           COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
           COALESCE(SUM(d.revenue), 0)::numeric(14,2) AS revenue
         FROM periods p
         LEFT JOIN dispatches d ON d.bucket = p.bucket
         GROUP BY p.bucket
         ORDER BY p.bucket ASC`,
        [startDate, endDate]
      ),
      // Inbound value per month, in rupees, so it can be compared against
      // outbound revenue on one axis. grand_total is what the shipment was
      // actually priced at.
      sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS bucket
         ), arrivals AS (
           SELECT
             date_trunc('month', COALESCE(s.arrival_date, s.created_at))::date AS bucket,
             COALESCE(s.grand_total, 0) AS inbound_value
           FROM stock_inbound_shipments s
           WHERE COALESCE(s.arrival_date, s.created_at)::date BETWEEN $1::date AND $2::date
             AND s.approval_status <> 'rejected'
         )
         SELECT
           p.bucket,
           COUNT(a.*)::int AS arrivals,
           COALESCE(SUM(a.inbound_value), 0)::numeric(14,2) AS inbound_value
         FROM periods p
         LEFT JOIN arrivals a ON a.bucket = p.bucket
         GROUP BY p.bucket
         ORDER BY p.bucket ASC`,
        [startDate, endDate]
      ),
      // Stock health per division. current_stock is in the unit that division
      // sells in (square feet for stone, boxes or pieces elsewhere), which is
      // consistent within a row even though rows are not comparable.
      sql(
        `SELECT
           COALESCE(d.name, 'Uncategorized') AS division,
           COUNT(*) FILTER (WHERE ${availableQty} <= 0)::int AS out_of_stock,
           COUNT(*) FILTER (WHERE ${availableQty} > 0 AND ${availableQty} <= COALESCE(i.reorder_level, 0))::int AS low_stock,
           COUNT(*) FILTER (WHERE ${availableQty} <= COALESCE(i.reorder_level, 0))::int AS at_risk,
           COUNT(*)::int AS total_items,
           COALESCE(SUM(${availableQty}), 0)::numeric(14,2) AS current_stock,
           (
             SELECT string_agg(sub.name, ', ')
             FROM (
               SELECT i2.name
               FROM stock_items i2
               WHERE i2.is_active = TRUE
                 AND COALESCE(i2.division_id, -1) = COALESCE(d.id, -1)
                 AND ${availableQtyExpr(schemaCaps, 'i2')} <= COALESCE(i2.reorder_level, 0)
               ORDER BY ${availableQtyExpr(schemaCaps, 'i2')} ASC
               LIMIT 2
             ) sub
           ) AS critical_items_list
         FROM stock_items i
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.is_active = TRUE
         GROUP BY d.id, d.name
         ORDER BY at_risk DESC, division ASC`,
        []
      ),
      // Every salesperson x month row, no LIMIT - the Team tab slices this down
      // client-side for the spotlight without a second fetch.
      sql(
        `SELECT
           date_trunc('month', s.dispatch_date)::date AS bucket,
           ${salespersonLabelExpr} AS salesperson,
           COUNT(DISTINCT s.id)::int AS shipment_count,
           COALESCE(SUM(${netUnits}), 0)::numeric(14,2) AS total_qty,
           COALESCE(SUM(${netRevenue}), 0)::numeric(14,2) AS total_revenue
         FROM stock_outbound_shipments s
         LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
         ${salespersonUserJoin}
         LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
         LEFT JOIN stock_items i ON i.id = osi.item_id
         WHERE s.dispatch_date::date BETWEEN $1::date AND $2::date
           AND ${outboundShipped}
         GROUP BY bucket, salesperson
         ORDER BY bucket ASC, total_revenue DESC`,
        [startDate, endDate]
      ),
      // Leaderboard. Ordered by revenue, the only figure comparable across
      // stone and tile, and the same order the CSV export uses.
      //
      // growth_ratio prorates the previous month down to the share of the
      // current month that has elapsed ($4), so a month-to-date figure is
      // compared against a like-for-like slice rather than a full month.
      //
      // consistency_score is simply the share of months in the range with any
      // sales. The old version also subtracted a variance penalty scaled by an
      // unexplained constant, and divided by months the person appeared in
      // rather than months in the range, which handed a perfect score to
      // anyone with a single active month.
      sql(
        `WITH ${unitCostCte(schemaCaps)}, monthly AS (
           SELECT
             date_trunc('month', s.dispatch_date)::date AS bucket,
             ${salespersonLabelExpr} AS salesperson,
             COUNT(DISTINCT s.id)::int AS shipment_count,
             COALESCE(SUM(${netUnits}), 0)::numeric(14,2) AS total_qty,
             COALESCE(SUM(${netRevenue}), 0)::numeric(14,2) AS total_revenue,
             ${marginAggregates(schemaCaps)}
           FROM stock_outbound_shipments s
           LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
           ${salespersonUserJoin}
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           LEFT JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN unit_cost uc ON uc.item_id = i.id
           WHERE s.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShipped}
           GROUP BY bucket, salesperson
         ), ranked AS (
           SELECT
             salesperson,
             SUM(shipment_count)::int AS shipments,
             COALESCE(SUM(total_qty), 0)::numeric(14,2) AS quantity,
             COALESCE(SUM(total_revenue), 0)::numeric(14,2) AS revenue,
             COALESCE(SUM(uncosted_revenue), 0)::numeric(14,2) AS uncosted_revenue,
             COALESCE(SUM(cost), 0)::numeric(14,2) AS cost,
             COALESCE(MAX(total_revenue) FILTER (WHERE bucket = $3::date), 0)::numeric(14,2) AS current_period_revenue,
             COALESCE(MAX(total_revenue) FILTER (WHERE bucket = ($3::date - interval '1 month')::date), 0)::numeric(14,2) AS previous_period_revenue,
             COUNT(*) FILTER (WHERE total_revenue > 0)::int AS active_months
           FROM monthly
           GROUP BY salesperson
         )
         SELECT
           salesperson,
           shipments,
           quantity,
           revenue,
           uncosted_revenue,
           cost,
           ${marginColumns()},
           current_period_revenue,
           previous_period_revenue,
           CASE
             WHEN previous_period_revenue * $4::numeric = 0 THEN NULL
             ELSE ((current_period_revenue - previous_period_revenue * $4::numeric)
                   / (previous_period_revenue * $4::numeric))::numeric(10,4)
           END AS growth_ratio,
           LEAST(100, GREATEST(0, (active_months::numeric / $5::numeric) * 100))::numeric(10,2) AS consistency_score
         FROM ranked
         ORDER BY revenue DESC
         LIMIT 50`,
        [startDate, endDate, lastBucket, elapsedFraction, range.months]
      ),
      sql(
        `WITH item_sales AS (
           SELECT
             COALESCE(d.name, 'Uncategorized') AS division,
             i.name AS item_name,
             COALESCE(SUM(${netRevenue}), 0) AS revenue
           FROM stock_outbound_shipments s
           JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN stock_divisions d ON d.id = i.division_id
           WHERE s.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShipped}
           GROUP BY division, i.name
         ), ranked_items AS (
           SELECT
             division,
             item_name,
             revenue,
             ROW_NUMBER() OVER(PARTITION BY division ORDER BY revenue DESC) as rn_desc,
             ROW_NUMBER() OVER(PARTITION BY division ORDER BY revenue ASC) as rn_asc
           FROM item_sales
           WHERE revenue > 0
         ), division_totals AS (
           SELECT
             COALESCE(d.name, 'Uncategorized') AS division,
             COUNT(DISTINCT s.id)::int AS shipment_count,
             COALESCE(SUM(${netUnits}), 0)::numeric(14,2) AS total_qty,
             COALESCE(SUM(${netRevenue}), 0)::numeric(14,2) AS total_revenue
           FROM stock_outbound_shipments s
           JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN stock_divisions d ON d.id = i.division_id
           WHERE s.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShipped}
           GROUP BY division
         )
         SELECT
           dt.division,
           dt.shipment_count,
           dt.total_qty,
           dt.total_revenue,
           top.item_name AS top_item,
           top.revenue::numeric(14,2) AS top_item_revenue,
           worst.item_name AS worst_item,
           worst.revenue::numeric(14,2) AS worst_item_revenue
         FROM division_totals dt
         LEFT JOIN ranked_items top ON top.division = dt.division AND top.rn_desc = 1
         LEFT JOIN ranked_items worst ON worst.division = dt.division AND worst.rn_asc = 1
         ORDER BY dt.total_revenue DESC`,
        [startDate, endDate]
      ),
      // Approval speed over the selected range, plus the live pending backlog.
      // The lag is scoped to the range because the page offers a range picker;
      // the backlog is deliberately "right now", which is what a queue means.
      sql(
        `WITH approved AS (
           SELECT EXTRACT(EPOCH FROM (approved_at - submitted_at)) / 3600.0 AS lag_hours
           FROM stock_outbound_shipments
           WHERE approved_at IS NOT NULL
             AND submitted_at IS NOT NULL
             AND approved_at::date BETWEEN $1::date AND $2::date
         ), pending AS (
           SELECT EXTRACT(EPOCH FROM (NOW() - submitted_at)) / 3600.0 AS pending_age_hours
           FROM stock_outbound_shipments
           WHERE approval_status = 'pending' AND submitted_at IS NOT NULL
         )
         SELECT
           COALESCE((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY lag_hours) FROM approved), 0)::numeric(10,2) AS median_lag_hours,
           COALESCE((SELECT AVG(lag_hours) FROM approved), 0)::numeric(10,2) AS avg_lag_hours,
           (SELECT COUNT(*) FROM pending)::int AS pending_count,
           COALESCE((SELECT MAX(pending_age_hours) FROM pending), 0)::numeric(10,2) AS oldest_pending_hours`,
        [startDate, endDate]
      ),
      sql(
        `SELECT
           COUNT(*) FILTER (WHERE ${availableQty} <= 0)::int AS zero_stock,
           COUNT(*) FILTER (
             WHERE ${availableQty} > 0
               AND ${availableQty} <= COALESCE(i.reorder_level, 0)
           )::int AS low_stock,
           COUNT(*)::int AS total_items
         FROM stock_items i
         WHERE i.is_active = TRUE`,
        []
      ),
      // Reorder Now: items at or below reorder level that are still selling.
      sql(
        `WITH velocity AS (
           SELECT
             osi.item_id,
             SUM(${netUnits})::numeric AS sold_30d
           FROM stock_outbound_shipment_items osi
           JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
           JOIN stock_items i ON i.id = osi.item_id
           WHERE o.dispatch_date > NOW() - INTERVAL '30 days'
             AND ${outboundShippedO}
           GROUP BY osi.item_id
         )
         SELECT
           i.id,
           i.sku,
           i.name,
           COALESCE(d.name, 'Uncategorized') AS division,
           ${availableQty}::numeric(14,2) AS available_qty,
           v.sold_30d::numeric(14,2) AS sold_30d,
           ROUND(${availableQty} / v.sold_30d * 30, 1) AS days_cover
         FROM stock_items i
         JOIN velocity v ON v.item_id = i.id
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.is_active = TRUE
           AND v.sold_30d > 0
           AND ${availableQty} <= COALESCE(i.reorder_level, 0)
         ORDER BY days_cover ASC, v.sold_30d DESC
         LIMIT 8`,
        []
      ),
      // Dead Stock: on hand, nothing shipped in 60 days. Capital idle is valued
      // at what the stock actually cost to buy; items with no priced receipt
      // are counted but contribute no value rather than a made-up zero-cost one.
      sql(
        `WITH ${unitCostCte(schemaCaps)}
         SELECT
           COUNT(*)::int AS item_count,
           COALESCE(SUM(${availableQty}), 0)::numeric(14,2) AS units_idle,
           COALESCE(SUM(${availableQty} * uc.cost_per_unit) FILTER (WHERE uc.cost_per_unit IS NOT NULL), 0)::numeric(14,2) AS estimated_value,
           COUNT(*) FILTER (WHERE uc.cost_per_unit IS NULL)::int AS uncosted_items
         FROM stock_items i
         LEFT JOIN unit_cost uc ON uc.item_id = i.id
         WHERE i.is_active = TRUE
           AND ${availableQty} > 0
           AND NOT EXISTS (
             SELECT 1 FROM stock_outbound_shipment_items osi
             JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
             WHERE osi.item_id = i.id
               AND o.dispatch_date > NOW() - INTERVAL '60 days'
               AND ${outboundShippedO}
           )`,
        []
      ),
      // Pending Queue: 5 oldest pending dispatches
      sql(
        `SELECT
           o.id,
           o.shipment_number,
           o.submitted_at,
           o.customer_id,
           ${schemaCaps.hasOutboundSalespersonUserId ? `COALESCE(spu.name, sp.name) AS salesperson_name,` : `sp.name AS salesperson_name,`}
           c.name AS customer_name,
           EXTRACT(EPOCH FROM (NOW() - o.submitted_at)) / 3600.0 AS hours_pending
         FROM stock_outbound_shipments o
         LEFT JOIN stock_customers c ON c.id = o.customer_id
         LEFT JOIN stock_sales_people sp ON sp.id = o.salesperson_id
         ${schemaCaps.hasOutboundSalespersonUserId ? `LEFT JOIN stock_app_users spu ON spu.id = o.salesperson_user_id` : ''}
         WHERE o.approval_status = 'pending' AND o.submitted_at IS NOT NULL
         ORDER BY o.submitted_at ASC
         LIMIT 5`,
        []
      ),
      // Salesperson goal tracker for the current IST month. Month boundaries,
      // ownership and the excluded statuses all match
      // /api/stock/salesperson-analytics so the two pages report the same
      // number for the same person.
      sql(
        `WITH actual AS (
           SELECT
             u.id AS uid,
             COALESCE(SUM(${netRevenue}), 0) AS rev,
             COUNT(DISTINCT o.id) AS shipments
           FROM stock_app_users u
           JOIN stock_outbound_shipments o ON ${goalOwnership}
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = o.id
           LEFT JOIN stock_items i ON i.id = osi.item_id
           WHERE date_trunc('month', o.dispatch_date)
                 = date_trunc('month', (NOW() AT TIME ZONE 'Asia/Kolkata'))
             AND ${outboundShippedO}
           GROUP BY u.id
         )
         SELECT
           u.id,
           u.name,
           u.monthly_sales_goal::numeric(14,2) AS goal,
           COALESCE(a.rev, 0)::numeric(14,2) AS actual,
           COALESCE(a.shipments, 0)::int AS shipments
         FROM stock_app_users u
         LEFT JOIN actual a ON a.uid = u.id
         WHERE u.role = 'salesperson' AND u.monthly_sales_goal IS NOT NULL AND u.monthly_sales_goal > 0
         ORDER BY (COALESCE(a.rev,0) / u.monthly_sales_goal) DESC
         LIMIT 20`,
        []
      ),
      // Customer concentration. share_pct is measured against every customer in
      // the range, not just the eight returned, so the shares do not sum to 100
      // and the widget renders the remainder as its own slice.
      sql(
        `WITH ${unitCostCte(schemaCaps)}, totals AS (
           SELECT
             c.id,
             c.name,
             COALESCE(SUM(${netRevenue}), 0) AS revenue,
             COUNT(DISTINCT o.id)::int AS shipments,
             ${marginAggregates(schemaCaps)}
           FROM stock_outbound_shipments o
           JOIN stock_customers c ON c.id = o.customer_id
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = o.id
           LEFT JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN unit_cost uc ON uc.item_id = i.id
           WHERE o.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShippedO}
           GROUP BY c.id, c.name
         ), grand AS (SELECT SUM(revenue) AS total FROM totals)
         SELECT
           t.id,
           t.name,
           t.revenue::numeric(14,2) AS revenue,
           t.uncosted_revenue,
           t.cost,
           ${marginColumns('t.revenue', 't.uncosted_revenue', 't.cost')},
           t.shipments,
           g.total::numeric(14,2) AS all_customer_revenue,
           CASE WHEN g.total > 0 THEN ROUND((t.revenue / g.total) * 100, 1)::numeric(6,1) ELSE 0 END AS share_pct
         FROM totals t, grand g
         WHERE t.revenue > 0
         ORDER BY t.revenue DESC
         LIMIT 8`,
        [startDate, endDate]
      ),
      // Activity Feed: last 12 outbound/inbound events
      sql(
        `SELECT
           e.id,
           e.event_type,
           e.entity_type,
           e.entity_id,
           e.occurred_at,
           e.summary,
           u.name AS actor_name
         FROM stock_timeline_events e
         LEFT JOIN stock_app_users u ON u.id = e.recorded_by_user_id
         WHERE e.entity_type IN ('outbound_shipment', 'inbound_shipment')
           AND e.event_type NOT IN ('other')
         ORDER BY e.occurred_at DESC
         LIMIT 12`,
        []
      ),
      // ABC / Pareto. Only 50 rows are returned for the chart, but rank_at_80
      // is computed over every item with sales so the "N items make 80%"
      // caption stays true when the answer lies past rank 50.
      sql(
        `WITH item_rev AS (
           SELECT
             i.id,
             i.name,
             i.sku,
             SUM(${netRevenue}) AS revenue
           FROM stock_outbound_shipment_items osi
           JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
           JOIN stock_items i ON i.id = osi.item_id
           WHERE o.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShippedO}
           GROUP BY i.id, i.name, i.sku
           HAVING SUM(${netRevenue}) > 0
         ), ranked AS (
           SELECT
             id,
             name,
             sku,
             revenue,
             ROW_NUMBER() OVER (ORDER BY revenue DESC) AS rank,
             SUM(revenue) OVER (ORDER BY revenue DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_revenue,
             SUM(revenue) OVER () AS total_revenue,
             COUNT(*) OVER () AS total_items
           FROM item_rev
         ), pareto AS (
           SELECT COALESCE(MIN(rank), 0)::int AS rank_at_80
           FROM ranked
           WHERE cum_revenue >= total_revenue * 0.8
         )
         SELECT
           r.rank::int AS rank,
           r.id,
           r.name,
           r.sku,
           r.revenue::numeric(14,2) AS revenue,
           ROUND((r.cum_revenue / NULLIF(r.total_revenue,0)) * 100, 2)::numeric(6,2) AS cumulative_pct,
           r.total_items::int AS total_items_with_sales,
           p.rank_at_80
         FROM ranked r, pareto p
         ORDER BY r.rank
         LIMIT 50`,
        [startDate, endDate]
      ),
      // Monthly profit. Cost comes from what each item actually cost to buy,
      // averaged over priced receipts and held in the same unit the item sells
      // in. Lines for items with no priced receipt cannot be costed, so their
      // revenue is reported separately as uncosted_revenue instead of being
      // silently treated as pure profit.
      sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS bucket
         ), ${unitCostCte(schemaCaps)}, sales AS (
           SELECT
             date_trunc('month', o.dispatch_date)::date AS bucket,
             SUM(${netRevenue}) AS revenue,
             SUM(${netRevenue}) FILTER (WHERE uc.cost_per_unit IS NULL) AS uncosted_revenue,
             SUM(${netUnits} * uc.cost_per_unit) FILTER (WHERE uc.cost_per_unit IS NOT NULL) AS cost
           FROM stock_outbound_shipments o
           JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = o.id
           JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN unit_cost uc ON uc.item_id = i.id
           WHERE o.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShippedO}
           GROUP BY bucket
         )
         SELECT
           p.bucket,
           COALESCE(s.revenue, 0)::numeric(14,2) AS revenue,
           COALESCE(s.uncosted_revenue, 0)::numeric(14,2) AS uncosted_revenue,
           (COALESCE(s.revenue, 0) - COALESCE(s.uncosted_revenue, 0))::numeric(14,2) AS costed_revenue,
           COALESCE(s.cost, 0)::numeric(14,2) AS cost,
           (COALESCE(s.revenue, 0) - COALESCE(s.uncosted_revenue, 0) - COALESCE(s.cost, 0))::numeric(14,2) AS profit
         FROM periods p
         LEFT JOIN sales s ON s.bucket = p.bucket
         ORDER BY p.bucket ASC`,
        [startDate, endDate]
      ),
      // Price dispersion. The same item leaves the yard at a different rate on
      // every dispatch, and the spread is money rather than noise: uplift is
      // what the range would have billed had the below-median sales been
      // charged the item's own median rate.
      //
      // The median is over lines, not units, because it stands in for "the rate
      // this item normally goes out at", which is a decision made once per
      // dispatch regardless of how many boxes it covered.
      //
      // ponytail: items with fewer than MIN_PRICED_SALES dispatches are dropped
      // rather than modelled - a median over three sales is an anecdote, and
      // acting on it would send someone to renegotiate noise.
      sql(
        `WITH sale_lines AS (
           SELECT
             osi.item_id,
             i.sku,
             i.name,
             ${netUnits} AS units,
             COALESCE(osi.rate_per_unit, 0) AS rate
           FROM stock_outbound_shipments o
           JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = o.id
           JOIN stock_items i ON i.id = osi.item_id
           WHERE o.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShippedO}
         ), typical AS (
           SELECT
             item_id,
             COUNT(*)::int AS sale_count,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate)::numeric(12,2) AS median_rate,
             MIN(rate)::numeric(12,2) AS min_rate,
             MAX(rate)::numeric(12,2) AS max_rate
           FROM sale_lines
           WHERE units > 0 AND rate > 0
           GROUP BY item_id
           HAVING COUNT(*) >= $3::int
         ), by_item AS (
           SELECT
             l.item_id,
             MAX(l.sku) AS sku,
             MAX(l.name) AS name,
             t.sale_count,
             t.median_rate,
             t.min_rate,
             t.max_rate,
             SUM(l.units * l.rate)::numeric(14,2) AS revenue,
             COUNT(*) FILTER (WHERE l.rate < t.median_rate)::int AS below_count,
             SUM(CASE WHEN l.rate < t.median_rate THEN l.units * (t.median_rate - l.rate) ELSE 0 END)::numeric(14,2) AS uplift
           FROM sale_lines l
           JOIN typical t ON t.item_id = l.item_id
           WHERE l.units > 0 AND l.rate > 0
           GROUP BY l.item_id, t.sale_count, t.median_rate, t.min_rate, t.max_rate
           HAVING SUM(CASE WHEN l.rate < t.median_rate THEN l.units * (t.median_rate - l.rate) ELSE 0 END) > 0
         )
         SELECT
           by_item.*,
           -- Uplift across every qualifying item, not just the twelve returned,
           -- so the card's headline figure does not shrink as the table is cut.
           SUM(uplift) OVER ()::numeric(14,2) AS all_item_uplift
         FROM by_item
         ORDER BY uplift DESC
         LIMIT 12`,
        [startDate, endDate, MIN_PRICED_SALES]
      ),
    ]);

    const approvalOpsRow = approvalOps[0] || {};
    const stockRiskRow = stockRisk[0] || {};
    const deadStockData = deadStockRow[0] || {};

    const payload = {
      range: {
        months: range.months,
        startDate,
        endDate,
        lastBucket,
        // The UI drops or labels the final bucket wherever a comparison would
        // otherwise pit part of a month against a whole one.
        partialLastMonth: range.partialLastMonth,
        elapsedFraction: Number(elapsedFraction.toFixed(4)),
      },
      dispatchPerformance: {
        trend: dispatchTrend,
      },
      inboundFlow: {
        trend: inboundTrend,
      },
      inventoryHealth: {
        divisionRisk,
      },
      salespersonPerformance: {
        trend: salespersonTrend,
        ranking: salespersonRanking,
      },
      divisionPerformance: {
        ranking: divisionPerformance,
      },
      approvalOps: {
        medianLagHours: Number(approvalOpsRow.median_lag_hours || 0),
        avgLagHours: Number(approvalOpsRow.avg_lag_hours || 0),
        pendingCount: Number(approvalOpsRow.pending_count || 0),
        oldestPendingHours: Number(approvalOpsRow.oldest_pending_hours || 0),
      },
      stockRisk: {
        zeroStock: Number(stockRiskRow.zero_stock || 0),
        lowStock: Number(stockRiskRow.low_stock || 0),
        totalItems: Number(stockRiskRow.total_items || 0),
      },
      reorderNow: reorderNowRows,
      deadStock: {
        itemCount: Number(deadStockData.item_count || 0),
        unitsIdle: Number(deadStockData.units_idle || 0),
        estimatedValue: Number(deadStockData.estimated_value || 0),
        uncostedItems: Number(deadStockData.uncosted_items || 0),
      },
      pendingQueue: pendingQueueRows,
      salespersonGoals: salespersonGoalRows,
      customerConcentration: customerConcentrationRows,
      activityFeed: activityFeedRows,
      abcItems: abcItemRows,
      monthlyProfit: monthlyProfitRows,
      priceDispersion: priceDispersionRows,
    };

    cacheSet(cacheKey, payload);
    return NextResponse.json({ ...payload, _cache: 'miss' });
  } catch (error) {
    console.error('Failed to load admin analytics:', error);
    return NextResponse.json({ error: 'Failed to load admin analytics', detail: error.message }, { status: 500 });
  }
}
