import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import {
  availableQtyExpr,
  netRevenueExpr,
  netUnitsExpr,
  idleSinceExpr,
  idleStockWhere,
  marginAggregates,
  marginColumns,
  shippedFilter,
  unitCostCte,
} from '@/lib/stock-analytics-sql.mjs';
import { parseAnalyticsRange } from '@/lib/analytics-range.mjs';

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

export const GET = stockRoute(async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session || !hasAnyStockRole(appUser, ['admin', 'manager', 'read_only_admin'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') || 'leaderboard').toLowerCase();

  try {
    // Same window as the page the CSV was downloaded from.
    const { from: startDate, to: endDate, bucket, days } = parseAnalyticsRange(searchParams);
    const range = { startDate, endDate };
    const unit = bucket === 'day' ? 'day' : 'month';
    const stamp = new Date().toISOString().slice(0, 10);
    const schemaCaps = await getStockSchemaCapabilities();
    // Same expressions the dashboard uses, so a CSV and the screen it was
    // exported from can never disagree.
    const netRevenue = netRevenueExpr(schemaCaps, 'osi', 'i');
    const netUnits = netUnitsExpr(schemaCaps, 'osi', 'i');
    const availableQty = availableQtyExpr(schemaCaps, 'i');
    const outboundShipped = shippedFilter('s');
    const outboundShippedO = shippedFilter('o');

    if (type === 'leaderboard') {
      const salespersonLabelExpr = schemaCaps.hasOutboundSalespersonUserId
        ? `COALESCE(spu.name, sp.name, 'Unassigned')`
        : `COALESCE(sp.name, 'Unassigned')`;
      const salespersonUserJoin = schemaCaps.hasOutboundSalespersonUserId
        ? `LEFT JOIN stock_app_users spu ON spu.id = s.salesperson_user_id`
        : '';
      const rows = await sql(
        `WITH ${unitCostCte(schemaCaps)}, totals AS (
           SELECT
             ${salespersonLabelExpr} AS salesperson,
             COUNT(*)::int AS shipments,
             COALESCE(SUM(${netUnits}), 0)::numeric(14,2) AS quantity,
             COALESCE(SUM(${netRevenue}), 0)::numeric(14,2) AS revenue,
             ${marginAggregates(schemaCaps)}
           FROM stock_outbound_shipments s
           LEFT JOIN stock_sales_people sp ON sp.id = s.salesperson_id
           ${salespersonUserJoin}
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           LEFT JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN unit_cost uc ON uc.item_id = i.id
           WHERE s.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShipped}
           GROUP BY salesperson
         )
         SELECT salesperson, shipments, quantity, revenue, uncosted_revenue, cost, ${marginColumns()}
         FROM totals
         ORDER BY revenue DESC`,
        [range.startDate, range.endDate]
      );

      const headers = [
        { label: 'Salesperson', accessor: 'salesperson' },
        { label: 'Shipments', accessor: 'shipments' },
        { label: 'Billable Units (sqft for stone)', accessor: 'quantity' },
        { label: 'Revenue (INR)', accessor: 'revenue' },
        { label: 'Cost (INR)', accessor: 'cost' },
        { label: 'Gross Profit (INR)', accessor: 'gross_profit' },
        { label: 'Margin %', accessor: 'margin_pct' },
        { label: 'Uncosted Revenue (INR)', accessor: 'uncosted_revenue' },
      ];
      return csvResponse(`leaderboard_${range.startDate}_to_${range.endDate}_${stamp}.csv`, rowsToCsv(headers, rows));
    }

    if (type === 'risk') {
      const rows = await sql(
        `SELECT
           i.sku,
           i.name,
           COALESCE(d.name, 'Uncategorized') AS division,
           ${availableQty}::numeric(14,2) AS available_qty,
           i.unit_of_measure,
           COALESCE(i.reorder_level, 0) AS reorder_level,
           CASE
             WHEN ${availableQty} <= 0 THEN 'ZERO_STOCK'
             WHEN ${availableQty} <= COALESCE(i.reorder_level, 0) THEN 'LOW_STOCK'
             ELSE 'OK'
           END AS status
         FROM stock_items i
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.is_active = TRUE
           AND ${availableQty} <= COALESCE(i.reorder_level, 0)
         ORDER BY available_qty ASC`,
        []
      );
      const headers = [
        { label: 'SKU', accessor: 'sku' },
        { label: 'Item', accessor: 'name' },
        { label: 'Division', accessor: 'division' },
        { label: 'Available Qty', accessor: 'available_qty' },
        { label: 'Unit', accessor: 'unit_of_measure' },
        { label: 'Reorder Level', accessor: 'reorder_level' },
        { label: 'Status', accessor: 'status' },
      ];
      return csvResponse(`stock_risk_${stamp}.csv`, rowsToCsv(headers, rows));
    }

    if (type === 'trends') {
      const rows = await sql(
        `WITH periods AS (
           SELECT generate_series(date_trunc('${unit}', $1::date), date_trunc('${unit}', $2::date), interval '1 ${unit}')::date AS bucket
         ), inbound AS (
           SELECT
             date_trunc('${unit}', COALESCE(s.arrival_date, s.created_at))::date AS bucket,
             COUNT(*)::int AS arrivals,
             COALESCE(SUM(s.grand_total), 0)::numeric(14,2) AS inbound_value
           FROM stock_inbound_shipments s
           WHERE COALESCE(s.arrival_date, s.created_at)::date BETWEEN $1::date AND $2::date
             AND s.approval_status <> 'rejected'
           GROUP BY bucket
         ), outbound AS (
           SELECT
             date_trunc('${unit}', s.dispatch_date)::date AS bucket,
             COUNT(DISTINCT s.id)::int AS dispatches,
             COALESCE(SUM(${netUnits}), 0)::numeric(14,2) AS dispatched_units,
             COALESCE(SUM(${netRevenue}), 0)::numeric(14,2) AS dispatched_value
           FROM stock_outbound_shipments s
           LEFT JOIN stock_outbound_shipment_items osi ON osi.outbound_shipment_id = s.id
           LEFT JOIN stock_items i ON i.id = osi.item_id
           WHERE s.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShipped}
           GROUP BY bucket
         )
         SELECT
           to_char(p.bucket, '${unit === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}') AS month,
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
        { label: unit === 'day' ? 'Date' : 'Month', accessor: 'month' },
        { label: 'Arrivals', accessor: 'arrivals' },
        { label: 'Inbound Value (INR)', accessor: 'inbound_value' },
        { label: 'Dispatches', accessor: 'dispatches' },
        { label: 'Dispatched Billable Units', accessor: 'dispatched_units' },
        { label: 'Dispatched Value (INR)', accessor: 'dispatched_value' },
      ];
      return csvResponse(`monthly_trends_${range.startDate}_to_${range.endDate}.csv`, rowsToCsv(headers, rows));
    }

    if (type === 'reorder') {
      const rows = await sql(
        `WITH velocity AS (
           SELECT
             osi.item_id,
             SUM(${netUnits})::numeric AS sold_in_range
           FROM stock_outbound_shipment_items osi
           JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
           JOIN stock_items i ON i.id = osi.item_id
           WHERE o.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShippedO}
           GROUP BY osi.item_id
         )
         SELECT
           i.sku,
           i.name,
           COALESCE(d.name, 'Uncategorized') AS division,
           ${availableQty}::numeric(14,2) AS available_qty,
           i.unit_of_measure,
           COALESCE(i.reorder_level, 0) AS reorder_level,
           v.sold_in_range,
           ROUND(GREATEST(${availableQty}, 0) / (v.sold_in_range / $3::numeric), 1) AS days_cover
         FROM stock_items i
         JOIN velocity v ON v.item_id = i.id
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.is_active = TRUE
           AND v.sold_in_range > 0
           AND ${availableQty} <= COALESCE(i.reorder_level, 0)
         ORDER BY days_cover ASC, v.sold_in_range DESC`,
        [startDate, endDate, days]
      );
      const headers = [
        { label: 'SKU', accessor: 'sku' },
        { label: 'Item', accessor: 'name' },
        { label: 'Division', accessor: 'division' },
        { label: 'Available Qty', accessor: 'available_qty' },
        { label: 'Unit', accessor: 'unit_of_measure' },
        { label: 'Reorder Level', accessor: 'reorder_level' },
        { label: `Sold ${startDate} to ${endDate}`, accessor: 'sold_in_range' },
        { label: 'Days Cover', accessor: 'days_cover' },
      ];
      return csvResponse(`reorder_now_${startDate}_to_${endDate}.csv`, rowsToCsv(headers, rows));
    }

    if (type === 'deadstock') {
      const rows = await sql(
        `WITH ${unitCostCte(schemaCaps)}
         SELECT
           i.sku,
           i.name,
           COALESCE(d.name, 'Uncategorized') AS division,
           ${availableQty}::numeric(14,2) AS units_idle,
           i.unit_of_measure,
           uc.cost_per_unit::numeric(14,2) AS unit_cost,
           (${availableQty} * uc.cost_per_unit)::numeric(14,2) AS estimated_value,
           (SELECT MAX(o2.dispatch_date) FROM stock_outbound_shipment_items osi2
              JOIN stock_outbound_shipments o2 ON o2.id = osi2.outbound_shipment_id
              WHERE osi2.item_id = i.id AND ${shippedFilter('o2')}) AS last_dispatch_date,
           (CURRENT_DATE - (${idleSinceExpr(schemaCaps, 'i')})::date)::int AS days_idle
         FROM stock_items i
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         LEFT JOIN unit_cost uc ON uc.item_id = i.id
         WHERE ${idleStockWhere(schemaCaps, 'i', '$1::date')}
         ORDER BY estimated_value DESC NULLS LAST, units_idle DESC`,
        [startDate]
      );
      const headers = [
        { label: 'SKU', accessor: 'sku' },
        { label: 'Item', accessor: 'name' },
        { label: 'Division', accessor: 'division' },
        { label: 'Units Idle', accessor: 'units_idle' },
        { label: 'Unit', accessor: 'unit_of_measure' },
        { label: 'Unit Cost (INR)', accessor: (row) => row.unit_cost ?? 'unknown' },
        { label: 'Estimated Value (INR)', accessor: (row) => row.estimated_value ?? 'unknown' },
        { label: 'Last Dispatch', accessor: (row) => row.last_dispatch_date ? new Date(row.last_dispatch_date).toISOString().slice(0, 10) : 'never' },
        { label: 'Days Idle', accessor: 'days_idle' },
      ];
      return csvResponse(`dead_stock_since_${startDate}.csv`, rowsToCsv(headers, rows));
    }

    return NextResponse.json({ error: 'Unknown export type' }, { status: 400 });
  } catch (error) {
    console.error('Analytics CSV export failed:', error);
    return NextResponse.json({ error: 'Export failed', detail: error.message }, { status: 500 });
  }
});
