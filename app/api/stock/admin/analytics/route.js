import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import {
  availableQtyExpr,
  freightRepeatFlagExpr,
  freightRepeatedAmountExpr,
  goalProgressSql,
  netRevenueExpr,
  monthProgress,
  netUnitsExpr,
  idleStockWhere,
  marginAggregates,
  marginColumns,
  sellerFilter,
  shippedFilter,
  unitCostCte,
} from '@/lib/stock-analytics-sql.mjs';
import { findDuplicateItemPairs, summarizeDuplicateItems } from '@/lib/stock-duplicate-items.mjs';

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

// The admin page's review tabs: freight per truck and products typed twice.
async function loadReview(schemaCaps, startDate, endDate) {
  const [freightTripRows, freightSummaryRow, duplicateItemRows] = await Promise.all([
    // Freight per truck. Freight lives on stock_inbound_trips, charged once
    // per lorry however many invoices it carried (scripts/migrate-inbound-trips.mjs).
    //
    // Rows are one plate + arrival date with more than one invoice. Normally
    // that is a single trip whose invoices share one charge. When it is two or
    // more trips, someone chose "separate trip" for the same truck on the same
    // day; has_repeat marks a truck-day where one figure appears on more than
    // one of those trips, which is what a charge keyed twice looks like, and
    // repeated_amount is everything booked less one of each distinct figure.
    //
    // The driver is aggregated, not grouped on: one lorry logged as "Amir" and
    // "Unknown" is one delivery, and grouping by the name hid a sixth copy of
    // a charge behind a row of its own.
    //
    // Before the migration there are no trips to read, so the tab is empty
    // rather than wrong.
    schemaCaps.hasInboundTrips
      ? sql(
          `WITH member AS (
             SELECT
               ins.id,
               ins.trip_id,
               ins.shipment_number,
               ins.invoice_number,
               sup.name AS supplier,
               (SELECT COALESCE(SUM(isi.total_cost), 0)
                  FROM stock_inbound_shipment_items isi
                 WHERE isi.inbound_shipment_id = ins.id) AS goods,
               (SELECT COALESCE(SUM(isi.received_whole_qty + isi.received_broken_qty), 0)
                  FROM stock_inbound_shipment_items isi
                 WHERE isi.inbound_shipment_id = ins.id) AS units
             FROM stock_inbound_shipments ins
             JOIN stock_inbound_trips t ON t.id = ins.trip_id
             LEFT JOIN stock_suppliers sup ON sup.id = ins.supplier_id
             WHERE t.arrival_date BETWEEN $1::date AND $2::date
               AND ins.status <> 'cancelled'
           ), per_trip AS (
             SELECT
               t.id AS trip_id,
               COALESCE(NULLIF(TRIM(t.truck_license_plate), ''), '-') AS plate,
               t.plate_key,
               COALESCE(NULLIF(TRIM(t.driver_name), ''), '-') AS driver,
               t.arrival_date,
               (t.delivery_cost + t.unloading_labour_cost) AS freight,
               COUNT(m.id) AS shipments,
               SUM(m.goods) AS goods,
               SUM(m.units) AS units
             FROM stock_inbound_trips t
             JOIN member m ON m.trip_id = t.id
             GROUP BY t.id
           ), grouped AS (
             SELECT
               MIN(plate) AS plate,
               -- Every spelling of the driver on this truck-day, not one row
               -- per spelling: the same lorry logged as "Amir" on five trips
               -- and "Unknown" on the sixth is one delivery, and splitting it
               -- by driver hid the sixth copy of the charge.
               STRING_AGG(DISTINCT driver, ' / ') AS driver,
               -- As text, not a date: the driver would hand back a JS Date at
               -- local midnight, which serialises to the previous day for any
               -- timezone behind UTC. The UI only ever prints this.
               arrival_date::text AS arrival_date,
               COUNT(*)::int AS trip_count,
               SUM(shipments)::int AS shipments,
               -- One of each distinct charge: what this truck-day comes to
               -- once the repeats are taken out.
               SUM(DISTINCT freight)::numeric(14,2) AS freight_expected,
               SUM(freight)::numeric(14,2) AS freight_booked,
               SUM(goods)::numeric(14,2) AS goods_value,
               SUM(units)::int AS units,
               ${freightRepeatFlagExpr()} AS has_repeat,
               ${freightRepeatedAmountExpr()}::numeric(14,2) AS repeated_amount,
               ARRAY_AGG(trip_id) AS trip_ids
             FROM per_trip
             GROUP BY plate_key, arrival_date
             HAVING SUM(shipments) > 1 OR COUNT(*) > 1
           )
           SELECT
             g.plate,
             g.driver,
             g.arrival_date,
             g.trip_count,
             g.shipments,
             g.freight_expected,
             g.freight_booked,
             g.goods_value,
             g.units,
             g.has_repeat,
             g.repeated_amount,
             -- The invoices themselves, so expanding a row costs no round trip.
             -- Freight is shown once per trip, on its first invoice, because
             -- that is how often it was paid.
             (SELECT JSONB_AGG(
                       JSONB_BUILD_OBJECT(
                         'id', m.id,
                         'trip_id', m.trip_id,
                         'shipment_number', m.shipment_number,
                         'invoice_number', m.invoice_number,
                         'supplier', m.supplier,
                         'freight', CASE WHEN m.id = (SELECT MIN(m2.id) FROM member m2 WHERE m2.trip_id = m.trip_id)
                                         THEN p.freight END,
                         'goods', m.goods,
                         'units', m.units
                       ) ORDER BY m.trip_id, m.id)
                FROM member m
                JOIN per_trip p ON p.trip_id = m.trip_id
               WHERE m.trip_id = ANY(g.trip_ids)) AS shipments_detail,
             -- Across every group in the range, not only the rows shown.
             COALESCE(SUM(g.repeated_amount) OVER (), 0)::numeric(14,2) AS all_repeated_amount,
             COUNT(*) OVER ()::int AS all_trip_count
           FROM grouped g
           ORDER BY g.repeated_amount DESC NULLS LAST, g.freight_booked DESC
           LIMIT 15`,
          [startDate, endDate]
        )
      : Promise.resolve([]),
    // Range-wide freight, so the tab can say what share of what the business
    // bought was spent moving it. Freight comes from trips with at least one
    // live invoice; goods from the invoices themselves.
    schemaCaps.hasInboundTrips
      ? sql(
          `SELECT
             (SELECT COALESCE(SUM(t.delivery_cost + t.unloading_labour_cost), 0)
                FROM stock_inbound_trips t
               WHERE t.arrival_date BETWEEN $1::date AND $2::date
                 AND EXISTS (SELECT 1 FROM stock_inbound_shipments s
                              WHERE s.trip_id = t.id AND s.status <> 'cancelled'))::numeric(14,2) AS freight_total,
             (SELECT COALESCE(SUM(isi.total_cost), 0)
                FROM stock_inbound_shipment_items isi
                JOIN stock_inbound_shipments ins ON ins.id = isi.inbound_shipment_id
               WHERE ins.arrival_date::date BETWEEN $1::date AND $2::date
                 AND ins.status <> 'cancelled')::numeric(14,2) AS goods_total`,
          [startDate, endDate]
        )
      : Promise.resolve([]),

    // Products that share a brand + type + size + grade with another product,
    // which is the only place two rows can be the same tile typed twice. The
    // pairing itself is findDuplicateItemPairs() below - this query just gets
    // the candidates and the evidence, about 40 rows rather than all 629.
    //
    // Grade is in the bucket key deliberately: "Analya Marfil" Commercial and
    // Premium are different products bought at Rs 612 and Rs 1,062, and a rule
    // that called them one duplicate would be wrong about nearly every row.
    //
    // COALESCE in the key because a NULL size_id must still group with another
    // NULL - a plain row-value IN () drops those, and that is how the Gresbond
    // "Adhesive" pair went missing from an earlier count.
    //
    // Not date-ranged, unlike every other query here: a duplicate product is a
    // fact about the catalogue, not about the months on screen, and a stray row
    // last bought in April is exactly the one worth finding in September.
    sql(
      `WITH bucket AS (
         SELECT i.id,
                COALESCE(i.brand_id, -1) AS brand_id,
                COALESCE(i.type_id, -1) AS type_id,
                COALESCE(i.size_id, -1) AS size_id,
                lower(COALESCE(NULLIF(TRIM(i.grade), ''), '-')) AS grade_key
           FROM stock_items i
       ), shared AS (
         SELECT brand_id, type_id, size_id, grade_key
           FROM bucket
          GROUP BY 1, 2, 3, 4
         HAVING COUNT(*) > 1
       )
       SELECT
         i.id,
         i.sku,
         i.name,
         i.grade,
         i.is_active,
         b.brand_id,
         b.type_id,
         b.size_id,
         COALESCE(br.name, '-') AS brand,
         COALESCE(ty.name, '-') AS type,
         COALESCE(sz.label, '-') AS size,
         i.current_whole_qty AS qty,
         (SELECT COUNT(*) FROM stock_outbound_shipment_items so WHERE so.item_id = i.id)::int AS sells,
         (SELECT MAX(s.arrival_date)::date::text
            FROM stock_inbound_shipment_items si
            JOIN stock_inbound_shipments s ON s.id = si.inbound_shipment_id
           WHERE si.item_id = i.id) AS last_buy,
         -- Average of what was actually paid per unit, which is the evidence
         -- that two rows are one tile: a real duplicate was bought at the same
         -- price on both rows.
         (SELECT ROUND(AVG(si.total_cost / NULLIF(si.received_whole_qty, 0))::numeric, 2)
            FROM stock_inbound_shipment_items si
           WHERE si.item_id = i.id AND si.received_whole_qty > 0)::numeric(12,2) AS unit_cost,
         COALESCE((SELECT ARRAY_AGG(DISTINCT si.inbound_shipment_id)
                     FROM stock_inbound_shipment_items si
                    WHERE si.item_id = i.id), '{}') AS shipment_ids,
         -- The purchases behind each side, so expanding a row costs no round trip.
         (SELECT JSONB_AGG(x ORDER BY x->>'arrival_date' DESC)
            FROM (SELECT JSONB_BUILD_OBJECT(
                           'shipment_number', s.shipment_number,
                           'invoice_number', s.invoice_number,
                           'arrival_date', s.arrival_date::date::text,
                           'supplier', COALESCE(sup.name, '-'),
                           'qty', si.received_whole_qty,
                           'unit_cost', ROUND((si.total_cost / NULLIF(si.received_whole_qty, 0))::numeric, 2)
                         ) AS x
                    FROM stock_inbound_shipment_items si
                    JOIN stock_inbound_shipments s ON s.id = si.inbound_shipment_id
                    LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
                   WHERE si.item_id = i.id AND s.status <> 'cancelled') q) AS purchases
       FROM stock_items i
       JOIN bucket b ON b.id = i.id
       JOIN shared sh ON sh.brand_id = b.brand_id
                     AND sh.type_id = b.type_id
                     AND sh.size_id = b.size_id
                     AND sh.grade_key = b.grade_key
       LEFT JOIN stock_brands br ON br.id = i.brand_id
       LEFT JOIN stock_types ty ON ty.id = i.type_id
       LEFT JOIN stock_sizes sz ON sz.id = i.size_id
       ORDER BY i.id`,
      []
    ),
  ]);
  const duplicateItemPairs = findDuplicateItemPairs(duplicateItemRows);
  return {
    freight: {
      trips: freightTripRows,
      summary: freightSummaryRow[0] || {},
    },
    duplicateItems: {
      pairs: duplicateItemPairs,
      summary: summarizeDuplicateItems(duplicateItemPairs),
    },
  };
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
    // ?section=review is the admin page's freight + duplicate-item tabs. The
    // analytics page never shows those, so each caller gets only its own queries.
    const section = searchParamsForCache.get('section') === 'review' ? 'review' : 'analytics';
    const cacheKey = `${section}:${months}:${endDateParam}`;
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

    if (section === 'review') {
      const payload = await loadReview(schemaCaps, startDate, endDate);
      cacheSet(cacheKey, payload);
      return NextResponse.json({ ...payload, _cache: 'miss' });
    }

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
         WHERE ${idleStockWhere(schemaCaps, 'i')}`,
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
      sql(`${goalProgressSql(schemaCaps)}
         LIMIT 20`, []),
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
      // Top sellers. Only 50 rows are returned, but rank_at_80 is computed
      // over every item with sales so the "N items make 80%" caption stays
      // true when the answer lies past rank 50.
      //
      // days_left is today's stock divided by the range's average daily sales:
      // a best seller with a small number here is the one to reorder first.
      // Units and stock are in the item's own unit, so compare within a row.
      sql(
        `WITH ${unitCostCte(schemaCaps)}, item_rev AS (
           SELECT
             i.id,
             i.name,
             i.sku,
             COALESCE(d.name, 'Uncategorized') AS division,
             SUM(${netRevenue}) AS revenue,
             COALESCE(SUM(${netUnits}), 0) AS units,
             ${marginAggregates(schemaCaps)}
           FROM stock_outbound_shipment_items osi
           JOIN stock_outbound_shipments o ON o.id = osi.outbound_shipment_id
           JOIN stock_items i ON i.id = osi.item_id
           LEFT JOIN stock_divisions d ON d.id = i.division_id
           LEFT JOIN unit_cost uc ON uc.item_id = i.id
           WHERE o.dispatch_date::date BETWEEN $1::date AND $2::date
             AND ${outboundShippedO}
           GROUP BY i.id, i.name, i.sku, d.name
           HAVING SUM(${netRevenue}) > 0
         ), ranked AS (
           SELECT
             *,
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
           r.division,
           r.revenue::numeric(14,2) AS revenue,
           r.units::numeric(14,2) AS units,
           r.uncosted_revenue,
           r.cost,
           ${marginColumns('r.revenue', 'r.uncosted_revenue', 'r.cost')},
           ROUND((r.revenue / NULLIF(r.total_revenue, 0)) * 100, 1)::numeric(5,1) AS share_pct,
           ROUND((r.cum_revenue / NULLIF(r.total_revenue,0)) * 100, 2)::numeric(6,2) AS cumulative_pct,
           ${availableQty}::numeric(14,2) AS in_stock,
           CASE WHEN r.units > 0
             THEN ROUND(GREATEST(${availableQty}, 0) / (r.units / ($2::date - $1::date + 1)), 0)::int
           END AS days_left,
           r.total_items::int AS total_items_with_sales,
           p.rank_at_80
         FROM ranked r
         JOIN stock_items i ON i.id = r.id
         CROSS JOIN pareto p
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
