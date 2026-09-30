import { NextResponse } from 'next/server';
import { canSell, ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import {
  goalProgressSql,
  lastMonthToDateFilter,
  netRevenueExpr,
  ownershipFilter,
  rankAmong,
  sellFirstItem,
  sellFirstSql,
  shippedFilter,
} from '@/lib/stock-analytics-sql.mjs';
import { normalizeSettings } from '@/lib/attendance.mjs';

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Own numbers only — every query below is bound to appUser.id, there is no
  // ?userId= to widen it. Anyone a dispatch can be attributed to may read this,
  // which now includes an admin flagged to also sell.
  if (!appUser?.id || !canSell(appUser)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const schemaCaps = await getStockSchemaCapabilities();
    // Shared with the admin dashboard so both pages report the same number for
    // the same person.
    const owned = ownershipFilter(schemaCaps, 's', '$1');
    const netRevenue = netRevenueExpr(schemaCaps, 'soi', 'i');
    const shipped = shippedFilter('s');

    const [monthlyRows, currentMonthRows, recentRows, activeDayRows] = await Promise.all([
      // Exactly six calendar months, the current one last. generate_series keeps
      // a month with no dispatches as a zero bar instead of dropping it, and a
      // month-aligned start stops the oldest bar from holding a stray few days.
      sql(
        `WITH months AS (
           SELECT generate_series(
             DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')) - INTERVAL '5 months',
             DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')),
             INTERVAL '1 month'
           ) AS month_start
         ),
         agg AS (
           SELECT
             DATE_TRUNC('month', s.dispatch_date) AS month_start,
             COUNT(DISTINCT s.id) AS dispatch_count,
             COALESCE(SUM(${netRevenue}), 0) AS total_value
           FROM stock_outbound_shipments s
           JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
           JOIN stock_items i ON i.id = soi.item_id
           WHERE ${owned}
             AND ${shipped}
             AND s.dispatch_date >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')) - INTERVAL '5 months'
           GROUP BY 1
         )
         SELECT
           TO_CHAR(m.month_start, 'YYYY-MM') AS month_key,
           COALESCE(a.dispatch_count, 0) AS dispatch_count,
           COALESCE(a.total_value, 0) AS total_value
         FROM months m
         LEFT JOIN agg a ON a.month_start = m.month_start
         ORDER BY m.month_start ASC`,
        [appUser.id]
      ),
      sql(
        `SELECT
           TO_CHAR((NOW() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS today,
           COUNT(DISTINCT s.id) AS this_month_count,
           COALESCE(SUM(${netRevenue}), 0) AS this_month_value
         FROM stock_outbound_shipments s
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
       JOIN stock_items i ON i.id = soi.item_id
         WHERE ${owned}
           AND DATE_TRUNC('month', s.dispatch_date) = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata'))
           AND ${shipped}`,
        [appUser.id]
      ),
      sql(
        `SELECT
           s.id,
           s.shipment_number,
           s.dispatch_date,
           c.name AS customer_name,
           s.status,
           s.approval_status,
           COALESCE(SUM(${netRevenue}), 0) AS total_value
         FROM stock_outbound_shipments s
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
       JOIN stock_items i ON i.id = soi.item_id
         LEFT JOIN stock_customers c ON c.id = s.customer_id
         WHERE ${owned}
           AND ${shipped}
         GROUP BY s.id, s.shipment_number, s.dispatch_date, c.name, s.status, s.approval_status
         ORDER BY s.dispatch_date DESC
         LIMIT 10`,
        [appUser.id]
      ),
      // Days with at least one dispatch, for the sales streak. No items join -
      // one dispatch makes the day active regardless of value. dispatch_date is
      // a bare TIMESTAMP holding UTC, so shift it to IST before taking the date
      // or evening dispatches land on tomorrow.
      sql(
        `SELECT DISTINCT TO_CHAR((s.dispatch_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day
         FROM stock_outbound_shipments s
         WHERE ${owned}
           AND ${shipped}
           AND s.dispatch_date >= NOW() - INTERVAL '120 days'
         ORDER BY day ASC`,
        [appUser.id]
      ),
    ]);

    // Days off for the streak: the same weekly off day and holidays attendance
    // uses, so a quiet Wednesday is not a broken streak. A database without the
    // attendance tables just gets no days off, as before.
    const [settingsRows, holidayRows] = await Promise.all([
      sql('SELECT weekly_off_dow FROM stock_attendance_settings ORDER BY id LIMIT 1', []).catch(() => []),
      sql(
        `SELECT TO_CHAR(holiday_date, 'YYYY-MM-DD') AS day
           FROM stock_holidays
          WHERE holiday_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '120 days'
            AND holiday_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date`,
        []
      ).catch(() => []),
    ]);

    // Full last month for reference, plus the same days of it (1st..today's
    // day-of-month): the month-so-far is only ever compared with the latter.
    const lastMtd = lastMonthToDateFilter('s.dispatch_date');
    const lastMonthRows = await sql(
      `SELECT COALESCE(SUM(${netRevenue}), 0) AS last_month_value,
              COUNT(DISTINCT s.id) AS last_month_count,
              COALESCE(SUM(${netRevenue}) FILTER (WHERE ${lastMtd}), 0) AS last_mtd_value,
              COUNT(DISTINCT s.id) FILTER (WHERE ${lastMtd}) AS last_mtd_count
       FROM stock_outbound_shipments s
       JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
       JOIN stock_items i ON i.id = soi.item_id
       WHERE ${owned}
         AND DATE_TRUNC('month', s.dispatch_date) = DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '1 month')
         AND ${shipped}`,
      [appUser.id]
    );

    // The "close the gap" lists and the anonymous rank. Each degrades to empty
    // on its own so a failure here never takes the page down.
    const isSalesperson = appUser.role === 'salesperson';
    const [sellFirstRows, followUpRows, goalRows] = await Promise.all([
      // Same list the /stock home strip shows, from the same query. Only the
      // salesperson role has divisions to draw it from.
      isSalesperson
        ? sql(sellFirstSql(schemaCaps), [appUser.division_ids?.length ? appUser.division_ids : [-1]]).catch(() => [])
        : Promise.resolve([]),
      // Customers who bought from this person before but have gone quiet for
      // 45-180 days: the cheapest money to win back. Past 180 days they are
      // probably gone, and a list of those only discourages.
      // ponytail: "quiet" means quiet with this salesperson; a customer who
      // moved to a colleague still shows. Fine for a nudge list.
      sql(
        `SELECT
           c.id,
           c.name,
           TO_CHAR(MAX(s.dispatch_date), 'YYYY-MM-DD') AS last_order_on,
           COALESCE(SUM(${netRevenue}), 0) AS lifetime_value
         FROM stock_outbound_shipments s
         JOIN stock_customers c ON c.id = s.customer_id
         JOIN stock_outbound_shipment_items soi ON soi.outbound_shipment_id = s.id
         JOIN stock_items i ON i.id = soi.item_id
         WHERE ${owned}
           AND ${shipped}
         GROUP BY c.id, c.name
         HAVING MAX(s.dispatch_date) < NOW() - INTERVAL '45 days'
            AND MAX(s.dispatch_date) >= NOW() - INTERVAL '180 days'
         ORDER BY lifetime_value DESC
         LIMIT 5`,
        [appUser.id]
      ).catch(() => []),
      sql(goalProgressSql(schemaCaps), []).catch(() => []),
    ]);

    return NextResponse.json({
      activeDays: activeDayRows.map((r) => r.day),
      daysOff: {
        weeklyOffDow: settingsRows[0] ? normalizeSettings(settingsRows[0]).weekly_off_dow : null,
        holidays: holidayRows.map((r) => r.day),
      },
      today: currentMonthRows[0]?.today ?? null,
      monthlyTrend: monthlyRows.map((r, index) => ({
        monthKey: r.month_key,
        dispatchCount: Number(r.dispatch_count),
        totalValue: Number(r.total_value),
        isCurrent: index === monthlyRows.length - 1,
      })),
      thisMonth: {
        count: Number(currentMonthRows[0]?.this_month_count ?? 0),
        value: Number(currentMonthRows[0]?.this_month_value ?? 0),
      },
      lastMonth: {
        count: Number(lastMonthRows[0]?.last_month_count ?? 0),
        value: Number(lastMonthRows[0]?.last_month_value ?? 0),
        mtdCount: Number(lastMonthRows[0]?.last_mtd_count ?? 0),
        mtdValue: Number(lastMonthRows[0]?.last_mtd_value ?? 0),
      },
      // Never anyone else's name, id or figure - see rankAmong().
      rank: rankAmong(goalRows, appUser.id),
      sellFirst: sellFirstRows.map(sellFirstItem),
      followUps: followUpRows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        lastOrderOn: r.last_order_on,
        lifetimeValue: Number(r.lifetime_value),
      })),
      recentDispatches: recentRows.map((r) => ({
        id: r.id,
        shipmentNumber: r.shipment_number,
        dispatchDate: r.dispatch_date,
        customerName: r.customer_name,
        status: r.status,
        approvalStatus: r.approval_status,
        totalValue: Number(r.total_value),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load analytics', detail: error.message }, { status: 500 });
  }
}
