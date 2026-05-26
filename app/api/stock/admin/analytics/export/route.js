import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(headers, rows) {
  const head = headers.map((h) => csvEscape(h.label)).join(',');
  const body = rows
    .map((row) => headers.map((h) => csvEscape(typeof h.accessor === 'function' ? h.accessor(row) : row[h.accessor])).join(','))
    .join('\n');
  return `${head}\n${body}\n`;
}

function csvResponse(filename, body) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function rangeFromParams(searchParams) {
  const months = clampInt(searchParams.get('months'), 1, 24, 6);
  const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')) : new Date();
  if (Number.isNaN(endDate.getTime())) throw new Error('Invalid endDate');
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - (months - 1), 1));
  const normalizedEnd = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return {
    months,
    startDate: startDate.toISOString().slice(0, 10),
    endDate: normalizedEnd.toISOString().slice(0, 10),
  };
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

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') || 'leaderboard').toLowerCase();

  try {
    const range = rangeFromParams(searchParams);
    const stamp = new Date().toISOString().slice(0, 10);

    if (type === 'leaderboard') {
      const schemaCaps = await getStockSchemaCapabilities();
      const salespersonLabelExpr = schemaCaps.hasOutboundSalespersonUserId
        ? `COALESCE(spu.name, sp.name, 'Unassigned')`
        : `COALESCE(sp.name, 'Unassigned')`;
      const salespersonUserJoin = schemaCaps.hasOutboundSalespersonUserId
        ? `LEFT JOIN stock_app_users spu ON spu.id = s.salesperson_user_id`
        : '';
      const rows = await sql(
        `SELECT
           ${salespersonLabelExpr} AS salesperson,
           COUNT(*)::int AS shipments,
           COALESCE(SUM(COALESCE(osi.loaded_whole_qty, 0) + COALESCE(osi.loaded_broken_qty, 0)), 0)::numeric(14,2) AS quantity,
           COALESCE(SUM((GREATEST(COALESCE(osi.loaded_whole_qty, 0) - COALESCE(osi.returned_whole_qty, 0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty, 0) - COALESCE(osi.returned_broken_qty, 0), 0)) * COALESCE(osi.rate_per_unit, 0)), 0)::numeric(14,2) AS revenue
         FROM stock_outbound_shipments s
         LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
         ${salespersonUserJoin}
         LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
         WHERE COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
         GROUP BY salesperson
         ORDER BY revenue DESC`,
        [range.startDate, range.endDate]
      );

      const headers = [
        { label: 'Salesperson', accessor: 'salesperson' },
        { label: 'Shipments', accessor: 'shipments' },
        { label: 'Quantity (units)', accessor: 'quantity' },
        { label: 'Revenue (INR)', accessor: 'revenue' },
      ];
      return csvResponse(`leaderboard_${range.startDate}_to_${range.endDate}_${stamp}.csv`, rowsToCsv(headers, rows));
    }

    if (type === 'risk') {
      const rows = await sql(
        `SELECT
           i.sku,
           i.name,
           COALESCE(d.name, 'Uncategorized') AS division,
           COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) AS available_qty,
           COALESCE(i.reorder_level, 0) AS reorder_level,
           CASE
             WHEN COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) <= 0 THEN 'ZERO_STOCK'
             WHEN COALESCE(i.reorder_level, 0) > 0 AND COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) <= COALESCE(i.reorder_level, 0) THEN 'LOW_STOCK'
             ELSE 'OK'
           END AS status
         FROM stock_items i
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.is_active = TRUE
           AND (
             COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) <= 0
             OR (COALESCE(i.reorder_level, 0) > 0 AND COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) <= COALESCE(i.reorder_level, 0))
           )
         ORDER BY available_qty ASC`,
        []
      );
      const headers = [
        { label: 'SKU', accessor: 'sku' },
        { label: 'Item', accessor: 'name' },
        { label: 'Division', accessor: 'division' },
        { label: 'Available Qty', accessor: 'available_qty' },
        { label: 'Reorder Level', accessor: 'reorder_level' },
        { label: 'Status', accessor: 'status' },
      ];
      return csvResponse(`stock_risk_${stamp}.csv`, rowsToCsv(headers, rows));
    }

    if (type === 'trends') {
      const rows = await sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS bucket
         ), inbound AS (
           SELECT
             date_trunc('month', COALESCE(s.arrival_date, s.created_at))::date AS bucket,
             COUNT(*)::int AS arrivals,
             COALESCE(SUM(s.grand_total), 0)::numeric(14,2) AS inbound_value
           FROM stock_inbound_shipments s
           WHERE COALESCE(s.arrival_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY bucket
         ), outbound AS (
           SELECT
             date_trunc('month', COALESCE(s.dispatch_date, s.created_at))::date AS bucket,
             COUNT(*)::int AS dispatches,
             COALESCE(SUM(COALESCE(osi.loaded_whole_qty, 0) + COALESCE(osi.loaded_broken_qty, 0)), 0)::numeric(14,2) AS dispatched_units,
             COALESCE(SUM((GREATEST(COALESCE(osi.loaded_whole_qty, 0) - COALESCE(osi.returned_whole_qty, 0), 0) + GREATEST(COALESCE(osi.loaded_broken_qty, 0) - COALESCE(osi.returned_broken_qty, 0), 0)) * COALESCE(osi.rate_per_unit, 0)), 0)::numeric(14,2) AS dispatched_value
           FROM stock_outbound_shipments s
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           WHERE COALESCE(s.dispatch_date, s.created_at)::date BETWEEN $1::date AND $2::date
           GROUP BY bucket
         )
         SELECT
           to_char(p.bucket, 'YYYY-MM') AS month,
           COALESCE(i.arrivals, 0) AS arrivals,
           COALESCE(i.inbound_value, 0) AS inbound_value,
           COALESCE(o.dispatches, 0) AS dispatches,
           COALESCE(o.dispatched_units, 0) AS dispatched_units,
           COALESCE(o.dispatched_value, 0) AS dispatched_value
         FROM periods p
         LEFT JOIN inbound i ON i.bucket = p.bucket
         LEFT JOIN outbound o ON o.bucket = p.bucket
         ORDER BY p.bucket ASC`,
        [range.startDate, range.endDate]
      );
      const headers = [
        { label: 'Month', accessor: 'month' },
        { label: 'Arrivals', accessor: 'arrivals' },
        { label: 'Inbound Value (INR)', accessor: 'inbound_value' },
        { label: 'Dispatches', accessor: 'dispatches' },
        { label: 'Dispatched Units', accessor: 'dispatched_units' },
        { label: 'Dispatched Value (INR)', accessor: 'dispatched_value' },
      ];
      return csvResponse(`monthly_trends_${range.startDate}_to_${range.endDate}.csv`, rowsToCsv(headers, rows));
    }

    if (type === 'reorder') {
      const rows = await sql(
        `WITH velocity AS (
           SELECT osi.item_id, SUM(COALESCE(osi.loaded_whole_qty,0) + COALESCE(osi.loaded_broken_qty,0))::numeric AS sold_30d
           FROM stock_outbound_shipment_items osi
           JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
           WHERE o.dispatch_date > NOW() - INTERVAL '30 days'
           GROUP BY osi.item_id
         )
         SELECT
           i.sku,
           i.name,
           COALESCE(d.name, 'Uncategorized') AS division,
           (COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)) AS available_qty,
           COALESCE(i.reorder_level, 0) AS reorder_level,
           v.sold_30d AS sold_last_30d,
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
         ORDER BY days_cover NULLS FIRST, v.sold_30d DESC`,
        []
      );
      const headers = [
        { label: 'SKU', accessor: 'sku' },
        { label: 'Item', accessor: 'name' },
        { label: 'Division', accessor: 'division' },
        { label: 'Available Qty', accessor: 'available_qty' },
        { label: 'Reorder Level', accessor: 'reorder_level' },
        { label: 'Sold Last 30d', accessor: 'sold_last_30d' },
        { label: 'Days Cover', accessor: 'days_cover' },
      ];
      return csvResponse(`reorder_now_${stamp}.csv`, rowsToCsv(headers, rows));
    }

    if (type === 'deadstock') {
      const rows = await sql(
        `SELECT
           i.sku,
           i.name,
           COALESCE(d.name, 'Uncategorized') AS division,
           (COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)) AS units_idle,
           COALESCE(NULLIF(i.landed_cost, 0), NULLIF(i.purchase_price, 0), 0) AS unit_cost,
           ((COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)) * COALESCE(NULLIF(i.landed_cost, 0), NULLIF(i.purchase_price, 0), 0)) AS estimated_value,
           (SELECT MAX(o2.dispatch_date) FROM stock_outbound_shipment_items osi2
              JOIN stock_outbound_shipments o2 ON o2.id = osi2.outbound_shipment_id
              WHERE osi2.item_id = i.id) AS last_dispatch_date
         FROM stock_items i
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.is_active = TRUE
           AND (COALESCE(i.current_whole_qty,0) + COALESCE(i.current_broken_qty,0)) > 0
           AND NOT EXISTS (
             SELECT 1 FROM stock_outbound_shipment_items osi
             JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
             WHERE osi.item_id = i.id AND o.dispatch_date > NOW() - INTERVAL '60 days'
           )
         ORDER BY units_idle DESC`,
        []
      );
      const headers = [
        { label: 'SKU', accessor: 'sku' },
        { label: 'Item', accessor: 'name' },
        { label: 'Division', accessor: 'division' },
        { label: 'Units Idle', accessor: 'units_idle' },
        { label: 'Unit Cost (INR)', accessor: 'unit_cost' },
        { label: 'Estimated Value (INR)', accessor: 'estimated_value' },
        { label: 'Last Dispatch', accessor: (row) => row.last_dispatch_date ? new Date(row.last_dispatch_date).toISOString().slice(0, 10) : 'never' },
      ];
      return csvResponse(`dead_stock_${stamp}.csv`, rowsToCsv(headers, rows));
    }

    return NextResponse.json({ error: 'Unknown export type' }, { status: 400 });
  } catch (error) {
    console.error('Analytics CSV export failed:', error);
    return NextResponse.json({ error: 'Export failed', detail: error.message }, { status: 500 });
  }
}
