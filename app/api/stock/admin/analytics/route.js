import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';

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

  return {
    months: rangeMonths,
    startDate,
    endDate: normalizedEnd,
  };
}

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
  const userRole = normalizeStockRole(appUser?.role);

  if (!session || userRole !== 'manager') {
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

    const { searchParams } = new URL(request.url);
    const range = normalizeRange(searchParams);
    const startDate = toDateOnly(range.startDate);
    const endDate = toDateOnly(range.endDate);

    const [
      purchaseTrend,
      purchaseFunnelRows,
      dispatchTrend,
      inboundCostTrend,
      paymentMix,
      paymentExposure,
      divisionRisk,
      inventoryRiskTrend,
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
    ] = await Promise.all([
      sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS bucket
         ), shipments AS (
           SELECT
             date_trunc('month', COALESCE(submitted_at, arrival_date, created_at))::date AS bucket,
             approval_status
           FROM stock_inbound_shipments
           WHERE COALESCE(submitted_at, arrival_date, created_at)::date BETWEEN $1::date AND $2::date
         )
         SELECT
           p.bucket,
           COUNT(s.*)::int AS total,
           COUNT(*) FILTER (WHERE s.approval_status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE s.approval_status = 'reviewed')::int AS reviewed,
           COUNT(*) FILTER (WHERE s.approval_status = 'approved')::int AS approved,
           COUNT(*) FILTER (WHERE s.approval_status = 'rejected')::int AS rejected,
           COUNT(*) FILTER (WHERE s.approval_status = 'changes_requested')::int AS changes_requested
         FROM periods p
         LEFT JOIN shipments s ON s.bucket = p.bucket
         GROUP BY p.bucket
         ORDER BY p.bucket ASC`,
        [startDate, endDate]
      ),
      sql(
        `SELECT
           approval_status,
           COUNT(*)::int AS count
         FROM stock_inbound_shipments
         WHERE COALESCE(submitted_at, arrival_date, created_at)::date BETWEEN $1::date AND $2::date
         GROUP BY approval_status`,
        [startDate, endDate]
      ),
      sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS bucket
         ), dispatch_items AS (
           SELECT
             outbound_shipment_id,
             COALESCE(SUM(loaded_whole_qty), 0) + COALESCE(SUM(loaded_broken_qty), 0) AS total_qty
           FROM stock_outbound_shipment_items
           GROUP BY outbound_shipment_id
         ), dispatches AS (
           SELECT
             date_trunc('month', COALESCE(dispatch_date, created_at))::date AS bucket,
             status,
             approval_status,
             dispatch_date,
             delivered_date,
             COALESCE(di.total_qty, 0) AS total_qty,
             CASE
               WHEN delivered_date IS NOT NULL AND dispatch_date IS NOT NULL THEN GREATEST(EXTRACT(EPOCH FROM (delivered_date - dispatch_date)) / 86400.0, 0)
               ELSE NULL
             END AS delay_days,
             CASE
               WHEN delivered_date IS NOT NULL AND dispatch_date IS NOT NULL AND delivered_date <= dispatch_date + interval '2 days' THEN 1
               ELSE 0
             END AS on_time_flag
           FROM stock_outbound_shipments s
           LEFT JOIN dispatch_items di ON di.outbound_shipment_id = s.id
           WHERE COALESCE(dispatch_date, created_at)::date BETWEEN $1::date AND $2::date
         )
         SELECT
           p.bucket,
           COUNT(d.*)::int AS total,
           COUNT(*) FILTER (WHERE d.status = 'submitted')::int AS submitted,
           COUNT(*) FILTER (WHERE d.status = 'packed')::int AS packed,
           COUNT(*) FILTER (WHERE d.status = 'dispatched')::int AS dispatched,
           COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
           COUNT(*) FILTER (WHERE d.status = 'cancelled')::int AS cancelled,
           COALESCE(AVG(d.delay_days), 0)::numeric(10,2) AS avg_delay_days,
           COALESCE(SUM(d.total_qty), 0)::numeric(14,2) AS dispatched_volume,
           CASE
             WHEN COUNT(*) FILTER (WHERE d.delivered_date IS NOT NULL) = 0 THEN 0
             ELSE (
               SUM(d.on_time_flag)::numeric / NULLIF(COUNT(*) FILTER (WHERE d.delivered_date IS NOT NULL), 0)
             )
           END::numeric(10,4) AS on_time_ratio
         FROM periods p
         LEFT JOIN dispatches d ON d.bucket = p.bucket
         GROUP BY p.bucket
         ORDER BY p.bucket ASC`,
        [startDate, endDate]
      ),
      sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS bucket
         ), shipment_cost AS (
           SELECT
             s.id,
             date_trunc('month', COALESCE(s.submitted_at, s.arrival_date, s.created_at))::date AS bucket,
             COALESCE(SUM(COALESCE(isi.qty_sqm, 0)), 0) AS total_qty_sqm,
             COALESCE(AVG(NULLIF(isi.cost_per_sqm, 0)), 0) AS avg_cost_per_sqm
           FROM stock_inbound_shipments s
           LEFT JOIN stock_inbound_shipment_items isi ON isi.inbound_shipment_id = s.id
           WHERE COALESCE(s.submitted_at, s.arrival_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY s.id, bucket
         )
         SELECT
           p.bucket,
           COALESCE(AVG(sc.avg_cost_per_sqm), 0)::numeric(12,2) AS avg_cost_per_sqm,
           COALESCE(SUM(sc.total_qty_sqm), 0)::numeric(14,3) AS total_qty_sqm
         FROM periods p
         LEFT JOIN shipment_cost sc ON sc.bucket = p.bucket
         GROUP BY p.bucket
         ORDER BY p.bucket ASC`,
        [startDate, endDate]
      ),
      sql(
        `SELECT
           payment_status,
           COUNT(*)::int AS count
         FROM stock_inbound_shipments
         WHERE COALESCE(submitted_at, arrival_date, created_at)::date BETWEEN $1::date AND $2::date
         GROUP BY payment_status`,
        [startDate, endDate]
      ),
      sql(
        `WITH shipment_totals AS (
           SELECT
             s.id,
             s.payment_status,
             COALESCE(s.paid_amount, 0) AS paid_amount,
             COALESCE(
               SUM(
                 CASE
                   WHEN COALESCE(isi.qty_sqm, 0) > 0 AND COALESCE(isi.cost_per_sqm, 0) > 0
                     THEN isi.qty_sqm * isi.cost_per_sqm
                   ELSE (COALESCE(isi.received_whole_qty, 0) + COALESCE(isi.received_broken_qty, 0)) * COALESCE(NULLIF(isi.unit_cost, 0), 0)
                 END
               ),
               0
             ) AS estimated_total
           FROM stock_inbound_shipments s
           LEFT JOIN stock_inbound_shipment_items isi ON isi.inbound_shipment_id = s.id
           WHERE COALESCE(s.submitted_at, s.arrival_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY s.id, s.payment_status, s.paid_amount
         )
         SELECT
           COALESCE(SUM(
             CASE
               WHEN payment_status = 'paid' THEN 0
               WHEN payment_status = 'unpaid' THEN estimated_total
               WHEN payment_status = 'partial' THEN GREATEST(estimated_total - paid_amount, 0)
               ELSE GREATEST(estimated_total - paid_amount, 0)
             END
           ), 0)::numeric(14,2) AS outstanding_exposure,
           COALESCE(SUM(estimated_total), 0)::numeric(14,2) AS estimated_gross
         FROM shipment_totals`,
        [startDate, endDate]
      ),
      sql(
        `SELECT
           COALESCE(d.name, 'Adhesive') AS division,
           COUNT(*) FILTER (WHERE COALESCE(i.reorder_level, 0) > 0 AND (COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0)) <= COALESCE(i.reorder_level, 0))::int AS at_risk,
           COUNT(*)::int AS total_items,
           COALESCE(SUM(COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0)), 0)::numeric(14,2) AS current_stock,
           (
             SELECT string_agg(sub.name, ', ')
             FROM (
               SELECT i2.name
               FROM stock_items i2
               WHERE i2.is_active = TRUE
                 AND COALESCE(i2.division_id, -1) = COALESCE(d.id, -1)
                 AND COALESCE(i2.reorder_level, 0) > 0 
                 AND (COALESCE(i2.current_whole_qty, 0) + COALESCE(i2.current_broken_qty, 0)) <= COALESCE(i2.reorder_level, 0)
               ORDER BY (COALESCE(i2.current_whole_qty, 0) + COALESCE(i2.current_broken_qty, 0)) ASC
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
      sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS bucket
         ), at_risk_items AS (
           SELECT id
           FROM stock_items
           WHERE is_active = TRUE
             AND COALESCE(reorder_level, 0) > 0
             AND (COALESCE(current_whole_qty, 0) + COALESCE(current_broken_qty, 0)) <= COALESCE(reorder_level, 0)
         ), inbound AS (
           SELECT
             date_trunc('month', COALESCE(s.arrival_date, s.created_at))::date AS bucket,
             COALESCE(SUM(COALESCE(isi.received_whole_qty, 0) + COALESCE(isi.received_broken_qty, 0)), 0) AS inbound_qty
           FROM stock_inbound_shipments s
           JOIN stock_inbound_shipment_items isi ON isi.inbound_shipment_id = s.id
           JOIN at_risk_items ari ON ari.id = isi.item_id
           WHERE s.approval_status = 'approved'
             AND COALESCE(s.arrival_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY bucket
         ), outbound AS (
           SELECT
             date_trunc('month', COALESCE(s.dispatch_date, s.created_at))::date AS bucket,
             COALESCE(SUM(COALESCE(osi.loaded_whole_qty, 0) + COALESCE(osi.loaded_broken_qty, 0)), 0) AS outbound_qty
           FROM stock_outbound_shipments s
           JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           JOIN at_risk_items ari ON ari.id = osi.item_id
           WHERE s.approval_status = 'approved'
             AND COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY bucket
         )
         SELECT
           p.bucket,
           COALESCE(i.inbound_qty, 0)::numeric(14,2) AS inbound_qty,
           COALESCE(o.outbound_qty, 0)::numeric(14,2) AS outbound_qty,
           (COALESCE(o.outbound_qty, 0) - COALESCE(i.inbound_qty, 0))::numeric(14,2) AS pressure
         FROM periods p
         LEFT JOIN inbound i ON i.bucket = p.bucket
         LEFT JOIN outbound o ON o.bucket = p.bucket
         ORDER BY p.bucket ASC`,
        [startDate, endDate]
      ),
      sql(
        `WITH shipment_qty AS (
           SELECT
             s.id,
             date_trunc('month', COALESCE(s.dispatch_date, s.created_at))::date AS bucket,
             ${salespersonLabelExpr} AS salesperson,
             COALESCE(SUM(COALESCE(osi.loaded_whole_qty, 0) + COALESCE(osi.loaded_broken_qty, 0)), 0) AS total_qty,
             COALESCE(SUM((GREATEST(COALESCE(osi.loaded_whole_qty, 0) - COALESCE(osi.returned_whole_qty, 0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty, 0) - COALESCE(osi.returned_broken_qty, 0), 0)) * COALESCE(osi.rate_per_unit, 0)), 0) AS total_revenue
           FROM stock_outbound_shipments s
           LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
           ${salespersonUserJoin}
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           WHERE COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY s.id, bucket, salesperson
         )
         SELECT
           bucket,
           salesperson,
           COUNT(*)::int AS shipment_count,
           COALESCE(SUM(total_qty), 0)::numeric(14,2) AS total_qty,
           COALESCE(SUM(total_revenue), 0)::numeric(14,2) AS total_revenue
         FROM shipment_qty
         GROUP BY bucket, salesperson
         ORDER BY bucket ASC, total_qty DESC`,
        [startDate, endDate]
      ),
      sql(
        `WITH monthly AS (
           SELECT
             date_trunc('month', COALESCE(s.dispatch_date, s.created_at))::date AS bucket,
             ${salespersonLabelExpr} AS salesperson,
             COUNT(*)::int AS shipment_count,
             COALESCE(SUM(COALESCE(osi.loaded_whole_qty, 0) + COALESCE(osi.loaded_broken_qty, 0)), 0)::numeric(14,2) AS total_qty,
             COALESCE(SUM((GREATEST(COALESCE(osi.loaded_whole_qty, 0) - COALESCE(osi.returned_whole_qty, 0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty, 0) - COALESCE(osi.returned_broken_qty, 0), 0)) * COALESCE(osi.rate_per_unit, 0)), 0)::numeric(14,2) AS total_revenue
           FROM stock_outbound_shipments s
           LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
           ${salespersonUserJoin}
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           WHERE COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY bucket, salesperson
         ), ranked AS (
           SELECT
             salesperson,
             SUM(shipment_count)::int AS shipments,
             COALESCE(SUM(total_qty), 0)::numeric(14,2) AS quantity,
             COALESCE(SUM(total_revenue), 0)::numeric(14,2) AS revenue,
             COALESCE(MAX(total_qty) FILTER (WHERE bucket = date_trunc('month', $2::date)), 0)::numeric(14,2) AS current_period_qty,
             COALESCE(MAX(total_qty) FILTER (WHERE bucket = date_trunc('month', $2::date) - interval '1 month'), 0)::numeric(14,2) AS previous_period_qty,
             COUNT(*) FILTER (WHERE total_qty > 0)::int AS active_months,
             COUNT(*)::int AS months_present,
             COALESCE(AVG(total_qty), 0)::numeric(14,2) AS avg_monthly_qty,
             COALESCE(STDDEV_POP(total_qty), 0)::numeric(14,2) AS stddev_monthly_qty
           FROM monthly
           GROUP BY salesperson
         )
         SELECT
           salesperson,
           shipments,
           quantity,
           revenue,
           current_period_qty,
           previous_period_qty,
           CASE
             WHEN previous_period_qty = 0 THEN NULL
             ELSE ((current_period_qty - previous_period_qty) / previous_period_qty)::numeric(10,4)
           END AS growth_ratio,
           LEAST(
             100,
             GREATEST(
               0,
               (active_months::numeric / NULLIF(months_present, 0)) * 100
               - (CASE
                    WHEN avg_monthly_qty = 0 THEN 0
                    ELSE (stddev_monthly_qty / avg_monthly_qty) * 18
                  END)
             )
           )::numeric(10,2) AS consistency_score
         FROM ranked
         ORDER BY quantity DESC
         LIMIT 8`,
        [startDate, endDate]
      ),
      sql(
        `WITH item_sales AS (
           SELECT
             COALESCE(d.name, 'Uncategorized') AS division,
             i.name AS item_name,
             COALESCE(SUM((GREATEST(COALESCE(osi.loaded_whole_qty, 0) - COALESCE(osi.returned_whole_qty, 0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty, 0) - COALESCE(osi.returned_broken_qty, 0), 0)) * COALESCE(osi.rate_per_unit, 0)), 0) AS revenue
           FROM stock_outbound_shipments s
           JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN stock_divisions d ON d.id = i.division_id
           WHERE COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
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
             COALESCE(SUM(COALESCE(osi.loaded_whole_qty, 0) + COALESCE(osi.loaded_broken_qty, 0)), 0)::numeric(14,2) AS total_qty,
             COALESCE(SUM((GREATEST(COALESCE(osi.loaded_whole_qty, 0) - COALESCE(osi.returned_whole_qty, 0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty, 0) - COALESCE(osi.returned_broken_qty, 0), 0)) * COALESCE(osi.rate_per_unit, 0)), 0)::numeric(14,2) AS total_revenue
           FROM stock_outbound_shipments s
           JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN stock_divisions d ON d.id = i.division_id
           WHERE COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
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
      sql(
        `WITH outbound AS (
           SELECT
             approval_status,
             submitted_at,
             approved_at,
             CASE
               WHEN approved_at IS NOT NULL AND submitted_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (approved_at - submitted_at)) / 3600.0
               ELSE NULL
             END AS lag_hours,
             CASE
               WHEN approval_status = 'pending' AND submitted_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (NOW() - submitted_at)) / 3600.0
               ELSE NULL
             END AS pending_age_hours
           FROM stock_outbound_shipments
         )
         SELECT
           COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY lag_hours) FILTER (WHERE lag_hours IS NOT NULL), 0)::numeric(10,2) AS median_lag_hours,
           COALESCE(AVG(lag_hours) FILTER (WHERE lag_hours IS NOT NULL), 0)::numeric(10,2) AS avg_lag_hours,
           COUNT(*) FILTER (WHERE approval_status = 'pending')::int AS pending_count,
           COALESCE(MAX(pending_age_hours), 0)::numeric(10,2) AS oldest_pending_hours
         FROM outbound`,
        []
      ),
      sql(
        `SELECT
           COUNT(*) FILTER (WHERE COALESCE(current_whole_qty, 0) + COALESCE(current_broken_qty, 0) <= 0)::int AS zero_stock,
           COUNT(*) FILTER (
             WHERE COALESCE(current_whole_qty, 0) + COALESCE(current_broken_qty, 0) > 0
               AND COALESCE(reorder_level, 0) > 0
               AND COALESCE(current_whole_qty, 0) + COALESCE(current_broken_qty, 0) <= COALESCE(reorder_level, 0)
           )::int AS low_stock,
           COUNT(*)::int AS total_items
         FROM stock_items
         WHERE is_active = TRUE`,
        []
      ),
      // Reorder Now: items at zero stock with active 30d velocity
      sql(
        `WITH velocity AS (
           SELECT osi.item_id, SUM(COALESCE(osi.loaded_whole_qty,0) + COALESCE(osi.loaded_broken_qty,0))::numeric AS sold_30d
           FROM stock_outbound_shipment_items osi
           JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
           WHERE o.dispatch_date > NOW() - INTERVAL '30 days'
           GROUP BY osi.item_id
         )
         SELECT
           i.id,
           i.sku,
           i.name,
           COALESCE(d.name, 'Uncategorized') AS division,
           (COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0))::int AS available_qty,
           v.sold_30d::int AS sold_30d,
           CASE WHEN v.sold_30d > 0
             THEN ROUND((COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)) / v.sold_30d * 30, 1)
             ELSE NULL
           END AS days_cover
         FROM stock_items i
         JOIN velocity v ON v.item_id = i.id
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.is_active = TRUE
           AND v.sold_30d > 0
           AND (COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)) <= COALESCE(i.reorder_level, 0)
         ORDER BY days_cover NULLS FIRST, v.sold_30d DESC
         LIMIT 8`,
        []
      ),
      // Dead Stock: items with qty > 0 and no outbound in 60d
      sql(
        `SELECT
           COUNT(*)::int AS item_count,
           COALESCE(SUM(COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)), 0)::int AS units_idle,
           COALESCE(SUM(
             (COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)) * COALESCE(NULLIF(i.landed_cost, 0), NULLIF(i.purchase_price, 0), 0)
           ), 0)::numeric(14,2) AS estimated_value
         FROM stock_items i
         WHERE i.is_active = TRUE
           AND (COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)) > 0
           AND NOT EXISTS (
             SELECT 1 FROM stock_outbound_shipment_items osi
             JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
             WHERE osi.item_id = i.id AND o.dispatch_date > NOW() - INTERVAL '60 days'
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
      // Salesperson Goal Tracker (current month, actual vs goal)
      sql(
        `WITH actual AS (
           SELECT
             o.salesperson_user_id AS uid,
             COALESCE(SUM((GREATEST(COALESCE(osi.loaded_whole_qty,0) - COALESCE(osi.returned_whole_qty,0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty,0) - COALESCE(osi.returned_broken_qty,0), 0)) * COALESCE(osi.rate_per_unit,0)), 0) AS rev,
             COUNT(DISTINCT o.id) AS shipments
           FROM stock_outbound_shipments o
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = o.id
           WHERE o.salesperson_user_id IS NOT NULL
             AND date_trunc('month', o.dispatch_date) = date_trunc('month', NOW())
           GROUP BY o.salesperson_user_id
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
      // Customer Concentration (top 8 in range)
      sql(
        `WITH totals AS (
           SELECT
             c.id,
             c.name,
             COALESCE(SUM((GREATEST(COALESCE(osi.loaded_whole_qty,0) - COALESCE(osi.returned_whole_qty,0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty,0) - COALESCE(osi.returned_broken_qty,0), 0)) * COALESCE(osi.rate_per_unit,0)), 0) AS revenue,
             COUNT(DISTINCT o.id)::int AS shipments
           FROM stock_outbound_shipments o
           JOIN stock_customers c ON c.id = o.customer_id
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = o.id
           WHERE COALESCE(o.dispatch_date, o.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY c.id, c.name
         ), grand AS (SELECT SUM(revenue) AS total FROM totals)
         SELECT
           t.id,
           t.name,
           t.revenue::numeric(14,2) AS revenue,
           t.shipments,
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
      // ABC Items: Pareto (per-item revenue in range, compute cumulative)
      sql(
        `WITH item_rev AS (
           SELECT
             i.id,
             i.name,
             i.sku,
             SUM((GREATEST(COALESCE(osi.loaded_whole_qty,0) - COALESCE(osi.returned_whole_qty,0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty,0) - COALESCE(osi.returned_broken_qty,0), 0)) * COALESCE(osi.rate_per_unit,0)) AS revenue
           FROM stock_outbound_shipment_items osi
           JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
           JOIN stock_items i ON i.id = osi.item_id
           WHERE COALESCE(o.dispatch_date, o.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY i.id, i.name, i.sku
           HAVING SUM((GREATEST(COALESCE(osi.loaded_whole_qty,0) - COALESCE(osi.returned_whole_qty,0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty,0) - COALESCE(osi.returned_broken_qty,0), 0)) * COALESCE(osi.rate_per_unit,0)) > 0
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
         )
         SELECT
           rank::int AS rank,
           id,
           name,
           sku,
           revenue::numeric(14,2) AS revenue,
           ROUND((cum_revenue / NULLIF(total_revenue,0)) * 100, 2)::numeric(6,2) AS cumulative_pct,
           total_items::int AS total_items_with_sales
         FROM ranked
         ORDER BY rank
         LIMIT 50`,
        [startDate, endDate]
      ),
    ]);

    const purchaseFunnel = {
      pending: 0,
      reviewed: 0,
      approved: 0,
      rejected: 0,
      changes_requested: 0,
    };

    for (const row of purchaseFunnelRows) {
      const key = row.approval_status;
      if (Object.prototype.hasOwnProperty.call(purchaseFunnel, key)) {
        purchaseFunnel[key] = Number(row.count || 0);
      }
    }

    const totalPurchases = purchaseTrend.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const totalApproved = purchaseTrend.reduce((sum, row) => sum + Number(row.approved || 0), 0);

    const approvalOpsRow = approvalOps[0] || {};
    const stockRiskRow = stockRisk[0] || {};

    const payload = {
      range: {
        months: range.months,
        startDate,
        endDate,
      },
      purchasePerformance: {
        trend: purchaseTrend,
        funnel: purchaseFunnel,
        kpis: {
          totalPurchases,
          approvalRate: totalPurchases > 0 ? Number((totalApproved / totalPurchases).toFixed(4)) : 0,
        },
      },
      dispatchPerformance: {
        trend: dispatchTrend,
        kpis: {
          totalDispatched: dispatchTrend.reduce((sum, row) => sum + Number(row.total || 0), 0),
          avgDelayDays: dispatchTrend.length
            ? Number((dispatchTrend.reduce((sum, row) => sum + Number(row.avg_delay_days || 0), 0) / dispatchTrend.length).toFixed(2))
            : 0,
          onTimeRatio: dispatchTrend.length
            ? Number((dispatchTrend.reduce((sum, row) => sum + Number(row.on_time_ratio || 0), 0) / dispatchTrend.length).toFixed(4))
            : 0,
        },
      },
      costAndPayment: {
        trend: inboundCostTrend,
        paymentMix,
        exposure: paymentExposure[0] || {
          outstanding_exposure: 0,
          estimated_gross: 0,
        },
      },
      inventoryHealth: {
        divisionRisk,
        trend: inventoryRiskTrend,
        kpis: {
          atRiskItems: divisionRisk.reduce((sum, row) => sum + Number(row.at_risk || 0), 0),
          totalItems: divisionRisk.reduce((sum, row) => sum + Number(row.total_items || 0), 0),
        },
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
        itemCount: Number((deadStockRow[0] || {}).item_count || 0),
        unitsIdle: Number((deadStockRow[0] || {}).units_idle || 0),
        estimatedValue: Number((deadStockRow[0] || {}).estimated_value || 0),
      },
      pendingQueue: pendingQueueRows,
      salespersonGoals: salespersonGoalRows,
      customerConcentration: customerConcentrationRows,
      activityFeed: activityFeedRows,
      abcItems: abcItemRows,
    };

    cacheSet(cacheKey, payload);
    return NextResponse.json({ ...payload, _cache: 'miss' });
  } catch (error) {
    console.error('Failed to load admin analytics:', error);
    return NextResponse.json({ error: 'Failed to load admin analytics', detail: error.message }, { status: 500 });
  }
}
