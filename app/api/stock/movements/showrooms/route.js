import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { showroomSplit } from '@/lib/stock-showroom';

/**
 * Every active showroom, with how much of one item is on display at each.
 *
 * The move form needs this to ask "which showroom?" and to show the balance
 * there — with two branches, "only 2 on a cassette" is meaningless without
 * saying where. Read-only, so any signed-in stock user may call it.
 *
 * GET /api/stock/movements/showrooms?itemId=123
 */
export async function GET(request) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  if (!appUser) return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 });

  try {
    const itemId = Number(new URL(request.url).searchParams.get('itemId'));
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const itemRows = await sql('SELECT id, unit_of_measure FROM stock_items WHERE id = $1', [itemId]);
    if (!itemRows[0]) return NextResponse.json({ error: 'Stock item not found' }, { status: 404 });

    // LEFT JOIN so a showroom holding none of this item still appears — you
    // must be able to send stock somewhere it has never been.
    const rows = await sql(
      `SELECT l.id, l.name,
              COALESCE(ss.whole_qty, 0) AS whole_qty,
              COALESCE(ss.sqft, 0) AS sqft,
              COALESCE(ss.installed_whole_qty, 0) AS installed_whole_qty,
              COALESCE(ss.installed_sqft, 0) AS installed_sqft
         FROM stock_locations l
         LEFT JOIN stock_showroom_stock ss ON ss.location_id = l.id AND ss.item_id = $1
        WHERE l.location_type = 'showroom' AND l.is_active
        ORDER BY l.id`,
      [itemId]
    );

    const unitOfMeasure = itemRows[0].unit_of_measure;

    return NextResponse.json({
      showrooms: rows.map((row) => {
        // Reuse the same split logic the rest of the app uses rather than
        // re-deriving cassette = total - installed here.
        const split = showroomSplit({
          unit_of_measure: unitOfMeasure,
          showroom_whole_qty: row.whole_qty,
          showroom_sqft: row.sqft,
          showroom_installed_whole_qty: row.installed_whole_qty,
          showroom_installed_sqft: row.installed_sqft,
        });
        return { id: Number(row.id), name: row.name, ...split };
      }),
    });
  } catch (error) {
    // The table is missing until db:migrate-showroom-per-location has run.
    // Degrade to "no branches" so the move form still works single-showroom,
    // matching how lib/stock-db-compat.js treats an un-migrated schema.
    if (String(error?.message || '').includes('stock_showroom_stock')) {
      return NextResponse.json({ showrooms: [] });
    }
    return NextResponse.json({ error: 'Failed to load showrooms', detail: error.message }, { status: 500 });
  }
}
