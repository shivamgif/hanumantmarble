import { NextResponse } from 'next/server';
import { getRoleFlags, getStockContext, normalizeText, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { GST_UQC_CODES } from '@/lib/gst-invoice.mjs';

/**
 * Item types and their units. Types are created as goods arrive (purchase
 * forms); this only sets the unit a counted-goods ("bag") type is sold in, so
 * invoices, e-invoices and e-way bills print it (0003_item_type_units.sql).
 */
function serialize(row) {
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category,
    unitLabel: row.unit_label,
    uqc: row.uqc,
    isActive: row.is_active,
    itemCount: Number(row.item_count),
  };
}

export const GET = stockRoute(async function GET(request) {
  const { appUser } = await getStockContext(request);
  const rows = await sql(
    `SELECT t.id, t.name, t.category, t.unit_label, t.uqc, t.is_active,
            (SELECT COUNT(*) FROM stock_items i WHERE i.type_id = t.id) AS item_count
       FROM stock_types t
      ORDER BY t.category, t.name`,
    []
  );
  return NextResponse.json({ types: rows.map(serialize), canManage: getRoleFlags(appUser.role).canApproveChanges });
});

export const PATCH = stockRoute(async function PATCH(request) {
  const { appUser } = await getStockContext(request);
  if (!getRoleFlags(appUser.role).canApproveChanges) {
    return NextResponse.json({ error: 'Only an admin or manager can change units.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const unitLabel = normalizeText(body?.unitLabel).toLowerCase() || null;
  if (unitLabel && unitLabel.length > 12) return NextResponse.json({ error: 'Unit name is at most 12 characters.' }, { status: 400 });
  const uqc = String(body?.uqc || '').trim().toUpperCase() || null;
  if (uqc && !GST_UQC_CODES[uqc]) return NextResponse.json({ error: `${uqc} is not a GST unit code.` }, { status: 400 });

  const [type] = await sql('SELECT category FROM stock_types WHERE id = $1', [id]);
  if (!type) return NextResponse.json({ error: 'Item type not found' }, { status: 404 });
  // Boxes-of-pieces and area stock have built-in units (box/piece, sqft) that
  // the stock maths depends on; only counted goods can be renamed.
  if (type.category !== 'bag') {
    return NextResponse.json({ error: 'Only counted goods can have their own unit.' }, { status: 400 });
  }

  const [row] = await sql(
    `UPDATE stock_types SET unit_label = $2, uqc = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, category, unit_label, uqc, is_active,
                (SELECT COUNT(*) FROM stock_items i WHERE i.type_id = stock_types.id) AS item_count`,
    [id, unitLabel, uqc]
  );
  return NextResponse.json({ type: serialize(row) });
});
