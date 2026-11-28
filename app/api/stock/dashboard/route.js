import { NextResponse } from 'next/server';
import { canSell, ensureDatabaseAvailable, getStockContext, normalizeStockRole, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { PURCHASE_GST_SQL } from '@/lib/gst-invoice.mjs';
import { loadFormSuggestions } from '@/lib/stock-suggestions';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import {
  netRevenueExpr,
  ownershipFilter,
  sellFirstItem,
  sellFirstSql,
  shippedFilter,
} from '@/lib/stock-analytics-sql.mjs';

export const GET = stockRoute(async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json(
      { error: 'Database not configured', message: 'Enable Neon PostgreSQL integration first.' },
      { status: 503 }
    );
  }

  const isSalesperson = appUser?.role === 'salesperson';
  // A salesperson with no divisions assigned gets an empty array — return nothing, not everything.
  const salespersonDivisionIds = isSalesperson
    ? (appUser?.division_ids?.length ? appUser.division_ids : [-1])
    : null;

  try {
    const schemaCaps = await getStockSchemaCapabilities();
    const weightPerUnitSelect = schemaCaps.hasStockItemsWeightPerUnitKg
      ? 'i.weight_per_unit_kg'
      : 'NULL::numeric AS weight_per_unit_kg';
    const ratePerBagSelect = schemaCaps.hasStockItemsRatePerBag
      ? 'i.rate_per_bag'
      : 'NULL::numeric AS rate_per_bag';
    // Stone stock lives in current_sqft, not current_whole_qty — without these
    // the stock screen would report 0 for every stone item.
    const sqftSelect = schemaCaps.hasStoneSqft
      ? `i.current_sqft,
           i.rate_per_sqft,
           (SELECT isi.slab_size_label FROM stock_inbound_shipment_items isi
              WHERE isi.item_id = i.id AND isi.slab_size_label IS NOT NULL
              ORDER BY isi.id DESC LIMIT 1) AS last_slab_size_label`
      : `0::numeric AS current_sqft,
           NULL::numeric AS rate_per_sqft,
           NULL::text AS last_slab_size_label`;
    // Stock physically at the showroom, held out of the warehouse counters.
    const showroomSelect = schemaCaps.hasShowroomInstalled
      ? `i.showroom_whole_qty,
           i.showroom_sqft,
           i.showroom_installed_whole_qty,
           i.showroom_installed_sqft`
      : `0 AS showroom_whole_qty,
           0::numeric AS showroom_sqft,
           0 AS showroom_installed_whole_qty,
           0::numeric AS showroom_installed_sqft`;
    // Lowest-stock-first must rank stone by sqft, not by an always-zero box count.
    const stockLevelOrder = schemaCaps.hasStoneSqft
      ? 'COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0) + COALESCE(i.current_sqft, 0)'
      : 'COALESCE(i.current_whole_qty, 0) + COALESCE(i.current_broken_qty, 0)';


    const dashboardPromise = Promise.all([
      // One statement, not three: queries inside withTenant share one
      // connection and run one after another, so each is a round-trip.
      sql(
        `SELECT v.*,
           (SELECT COUNT(*)
            FROM stock_inbound_shipments s
            WHERE s.approval_status = 'pending'
            ${salespersonDivisionIds ? `AND s.id IN (
              SELECT DISTINCT isi.inbound_shipment_id FROM stock_inbound_shipment_items isi
              JOIN stock_items i ON i.id = isi.item_id WHERE i.division_id = ANY($1::bigint[])
            )` : ''}) AS pending_arrival_count,
           (SELECT COUNT(*)
            FROM stock_outbound_shipments sos
            WHERE sos.approval_status = 'pending'
            ${salespersonDivisionIds ? `AND sos.id IN (
              SELECT DISTINCT soi.outbound_shipment_id FROM stock_outbound_shipment_items soi
              JOIN stock_items i ON i.id = soi.item_id WHERE i.division_id = ANY($1::bigint[])
            )` : ''}) AS pending_dispatch_count
         FROM (SELECT 1) AS one
         LEFT JOIN LATERAL (SELECT * FROM stock_dashboard_summary_view LIMIT 1) v ON TRUE`,
        salespersonDivisionIds ? [salespersonDivisionIds] : []
      ),
      sql(
        `SELECT
           i.id,
           i.sku,
           i.name,
           i.description,
           i.current_whole_qty,
           i.current_broken_qty,
           i.current_piece_remainder,
           i.current_broken_piece_remainder,
           i.reorder_level,
           i.tiles_per_box,
           i.pieces_per_box,
           i.thickness_mm,
           i.finish,
           i.grade,
           i.unit_of_measure,
           ${weightPerUnitSelect},
           ${ratePerBagSelect},
           ${sqftSelect},
           ${showroomSelect},
           b.name AS brand_name,
           t.name AS type_name,
           d.name AS division_name,
           s.label AS size_label,
           s.unit AS size_unit,
           s.width_mm,
           s.length_mm,
           (SELECT isi.hsn_code FROM stock_inbound_shipment_items isi
              WHERE isi.item_id = i.id AND isi.hsn_code IS NOT NULL
              ORDER BY isi.id DESC LIMIT 1) AS hsn_code,
           (SELECT isi.cost_per_sqm FROM stock_inbound_shipment_items isi
              WHERE isi.item_id = i.id AND isi.cost_per_sqm IS NOT NULL
              ORDER BY isi.id DESC LIMIT 1) AS cost_per_sqm,
           ${PURCHASE_GST_SQL} AS purchase_gst
         FROM stock_items i
         LEFT JOIN stock_brands b ON b.id = i.brand_id
         LEFT JOIN stock_types t ON t.id = i.type_id
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         LEFT JOIN stock_sizes s ON s.id = i.size_id
         WHERE i.is_active = true
         ${salespersonDivisionIds ? 'AND i.division_id = ANY($1::bigint[])' : ''}
         ORDER BY ${stockLevelOrder} ASC, i.name ASC`,
        salespersonDivisionIds ? [salespersonDivisionIds] : []
      ),
    ]);

    // Same lists as /api/stock/form-suggestions, minus the stone ones the
    // dashboard never showed; one statement either way (lib/stock-suggestions.js).
    const suggestionsPromise = loadFormSuggestions();

    const currentMonthValuePromise = canSell(appUser) && appUser?.id
      ? sql(
          // The same month-to-date figure the analytics page and the admin goal
          // tracker report, so all three agree: shared revenue rule, shared
          // ownership rule, shared excluded statuses, IST month boundaries.
          `SELECT COALESCE(SUM(${netRevenueExpr(schemaCaps, 'soi', 'i')}), 0) AS current_month_dispatch_value
           FROM stock_outbound_shipments s
           JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
           JOIN stock_items i ON i.id = soi.item_id
           WHERE ${ownershipFilter(schemaCaps, 's', '$1')}
             AND DATE_TRUNC('month', s.dispatch_date) = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata'))
             AND ${shippedFilter('s')}`,
          [appUser.id]
        )
      : Promise.resolve([{ current_month_dispatch_value: 0 }]);

    // Stock in this salesperson's divisions that has sat idle past the dead
    // stock line (lib/stock-analytics-sql.mjs), biggest money first. Ranked by
    // what it cost to buy, but the cost never leaves the server: a salesperson
    // who can read purchase prices can read the margin on every quote.
    const sellFirstPromise = isSalesperson
      ? sql(sellFirstSql(schemaCaps), [salespersonDivisionIds])
      : Promise.resolve([]);

    const [dashboardResults, allSuggestions, currentMonthValueRows, sellFirstRows] = await Promise.all([dashboardPromise, suggestionsPromise, currentMonthValuePromise, sellFirstPromise]);
    const [[headRow = {}], activeItems] = dashboardResults;
    const { pending_arrival_count: pendingArrivals, pending_dispatch_count: pendingDispatches, ...summary } = headRow;
    const { stoneType, stoneItemName, ...suggestions } = allSuggestions;

    return NextResponse.json({
      role: normalizeStockRole(appUser?.role),
      suggestions,
      summary,
      activeItems,
      pendingArrivalCount: Number(pendingArrivals ?? 0),
      pendingDispatchCount: Number(pendingDispatches ?? 0),
      currentMonthDispatchValue: Number(currentMonthValueRows[0]?.current_month_dispatch_value ?? 0),
      // Salespeople only; empty for every other role.
      sellFirst: {
        items: sellFirstRows.map(sellFirstItem),
      },
    });
  } catch (error) {
    console.error('Failed to load stock dashboard:', error);
    return NextResponse.json({ error: 'Failed to load dashboard', detail: error.message }, { status: 500 });
  }
});
