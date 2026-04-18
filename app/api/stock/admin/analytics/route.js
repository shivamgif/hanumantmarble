import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

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

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  const userRole = normalizeStockRole(appUser?.role);

  if (!session || (userRole !== 'admin' && userRole !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
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
           COALESCE(d.name, 'General') AS division,
           COUNT(*) FILTER (WHERE COALESCE(i.reorder_level, 0) > 0 AND (COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0)) <= COALESCE(i.reorder_level, 0))::int AS at_risk,
           COUNT(*)::int AS total_items,
           COALESCE(SUM(COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0)), 0)::numeric(14,2) AS current_stock
         FROM stock_items i
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.is_active = TRUE
         GROUP BY division
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
             COALESCE(sp.name, 'Unassigned') AS salesperson,
             COALESCE(SUM(COALESCE(osi.loaded_whole_qty, 0) + COALESCE(osi.loaded_broken_qty, 0)), 0) AS total_qty
           FROM stock_outbound_shipments s
           LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           WHERE COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY s.id, bucket, salesperson
         )
         SELECT
           bucket,
           salesperson,
           COUNT(*)::int AS shipment_count,
           COALESCE(SUM(total_qty), 0)::numeric(14,2) AS total_qty
         FROM shipment_qty
         GROUP BY bucket, salesperson
         ORDER BY bucket ASC, total_qty DESC`,
        [startDate, endDate]
      ),
      sql(
        `WITH monthly AS (
           SELECT
             date_trunc('month', COALESCE(s.dispatch_date, s.created_at))::date AS bucket,
             COALESCE(sp.name, 'Unassigned') AS salesperson,
             COUNT(*)::int AS shipment_count,
             COALESCE(SUM(COALESCE(osi.loaded_whole_qty, 0) + COALESCE(osi.loaded_broken_qty, 0)), 0)::numeric(14,2) AS total_qty
           FROM stock_outbound_shipments s
           LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           WHERE COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY bucket, salesperson
         ), ranked AS (
           SELECT
             salesperson,
             SUM(shipment_count)::int AS shipments,
             COALESCE(SUM(total_qty), 0)::numeric(14,2) AS quantity,
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

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('Failed to load admin analytics:', error);
    return NextResponse.json({ error: 'Failed to load admin analytics', detail: error.message }, { status: 500 });
  }
}
