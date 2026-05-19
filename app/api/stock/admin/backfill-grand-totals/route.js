import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, normalizeStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { recomputeInboundShipmentTotals } from '@/lib/stock-inbound-recompute';

export async function POST(request) {
  try {
    await ensureDatabaseAvailable();
    const { session, appUser } = await getStockContext(request);
    const role = normalizeStockRole(appUser?.role);
    if (!session || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const onlyZero = body.onlyZero !== false;
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite) : null;

    let targets;
    if (ids && ids.length) {
      targets = await sql(
        `SELECT id FROM stock_inbound_shipments WHERE id = ANY($1::bigint[]) ORDER BY id`,
        [ids]
      );
    } else if (onlyZero) {
      targets = await sql(
        `SELECT id FROM stock_inbound_shipments
         WHERE COALESCE(grand_total, 0) = 0
         ORDER BY id`
      );
    } else {
      targets = await sql(`SELECT id FROM stock_inbound_shipments ORDER BY id`);
    }

    const results = [];
    for (const { id } of targets) {
      try {
        const updated = await recomputeInboundShipmentTotals(id);
        results.push({ id, grand_total: updated?.grand_total ?? null, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err.message });
      }
    }

    return NextResponse.json({
      count: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (error) {
    console.error('Backfill grand totals failed:', error);
    return NextResponse.json({ error: 'Backfill failed', detail: error.message }, { status: 500 });
  }
}
