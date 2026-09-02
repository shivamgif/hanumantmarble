/**
 * Showroom stock movements.
 *
 * Stock sent to the showroom for display is still owned and still sellable, but
 * it is not in the warehouse — so it moves out of stock_items.current_* into the
 * parallel showroom_* counters rather than staying put and inflating the
 * warehouse number. Material stuck down as flooring is written off out of
 * showroom_* and survives only as the stock_movements row this route writes.
 *
 * POST /api/stock/movements  { itemId, action, qty, notes }
 * GET  /api/stock/movements  ?itemId=&limit=&offset=
 *
 * This is one second location, not a location dimension:
 * stock_inventory_lots.location_id stays unused, and stock_items remains the
 * denormalized read surface it already is for current_*.
 */

import { NextResponse } from 'next/server';
import { sql, withTransaction } from '@/lib/db';
import {
  ensureDatabaseAvailable,
  generateReference,
  getStockContext,
  hasAnyStockRole,
  normalizeText,
} from '@/lib/stock-workflow';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { logAudit } from '@/lib/audit-logger';
import { toSqft } from '@/lib/stock-sqft';
import { SHOWROOM_MOVES, resolveShowroomMove, showroomMoveKey, showroomSplit } from '@/lib/stock-showroom';

const WRITE_ROLES = ['admin', 'manager', 'stock_maintainer'];

// ponytail: one showroom, so the id is stable — cache it instead of joining on
// every read. Add a location param here if a second showroom ever opens.
let showroomLocationIdCache = null;
async function getShowroomLocationId() {
  if (showroomLocationIdCache) return showroomLocationIdCache;
  const rows = await sql(`SELECT id FROM stock_locations WHERE location_type = 'showroom' ORDER BY id LIMIT 1`, []);
  showroomLocationIdCache = rows[0]?.id ?? null;
  return showroomLocationIdCache;
}

export async function POST(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, WRITE_ROLES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const itemId = Number(body.itemId);
    const notes = normalizeText(body.notes) || null;

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: 'A stock item is required' }, { status: 400 });
    }
    // { action: 'to_showroom' | 'to_warehouse' | 'reclassify', state: 'cassette' | 'installed' }
    const moveKey = showroomMoveKey(body.action, body.state);
    if (!SHOWROOM_MOVES[moveKey]) {
      return NextResponse.json(
        { error: `Invalid action/state. Moves are: ${Object.keys(SHOWROOM_MOVES).join(', ')}` },
        { status: 400 }
      );
    }

    const schemaCaps = await getStockSchemaCapabilities();
    const showroomLocationId = schemaCaps.hasShowroomStock ? await getShowroomLocationId() : null;
    if (!showroomLocationId || !schemaCaps.hasShowroomInstalled) {
      return NextResponse.json(
        { error: 'Showroom stock is not set up. Run the migrations in scripts/migrations/2026-09-0*-showroom-*.sql' },
        { status: 503 }
      );
    }

    const result = await withTransaction(async (tx) => {
      // Same guard the dispatch approval uses: serialize concurrent writes to
      // one item so two transfers can't both pass the availability check.
      await tx(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`stock_showroom_move:${itemId}`]);

      const itemRows = await tx(
        `SELECT id, sku, name, unit_of_measure,
                current_whole_qty, current_sqft,
                showroom_whole_qty, showroom_sqft,
                showroom_installed_whole_qty, showroom_installed_sqft
           FROM stock_items WHERE id = $1`,
        [itemId]
      );
      const item = itemRows[0];
      if (!item) {
        throw Object.assign(new Error('Stock item not found'), { status: 404 });
      }

      // All unit/column/sign branching lives in resolveShowroomMove so it can be
      // asserted without a DB — see scripts/check-showroom-move.mjs.
      const move = resolveShowroomMove({
        move: moveKey,
        unitOfMeasure: item.unit_of_measure,
        qty: body.qty,
      });
      const { isStone, warehouseColumn, showroomColumn, installedColumn, qty, unit } = move;
      const split = showroomSplit(item);

      if (qty <= 0) {
        throw Object.assign(
          new Error(isStone ? 'Enter a quantity in sqft.' : 'Enter a whole-number quantity.'),
          { status: 400 }
        );
      }

      // Only cassette stock can leave the showroom or be marked installed —
      // installed stock is already stuck down. Checked before the writes so the
      // message names the real constraint rather than a bare constraint error.
      const needsCassette = move.showroomSign < 0 || move.installedSign > 0;
      if (needsCassette && qty > split.cassette) {
        throw Object.assign(
          new Error(
            `Only ${split.cassette} ${unit} is on a cassette for ${item.sku}` +
            (split.installed > 0 ? ` (${split.installed} is installed as flooring)` : '') +
            `, cannot move ${qty}.`
          ),
          { status: 400 }
        );
      }
      if (move.installedSign < 0 && qty > split.installed) {
        throw Object.assign(
          new Error(`Only ${split.installed} ${unit} is installed for ${item.sku}, cannot move ${qty} back to a cassette.`),
          { status: 400 }
        );
      }

      // Guarded decrements — the `>= $1` in the WHERE is what makes
      // over-transfer impossible even under a lost race. No row back means the
      // stock wasn't there.
      for (const [sign, column, where] of [
        [move.showroomSign, showroomColumn, 'at the showroom'],
        [move.warehouseSign, warehouseColumn, 'at the warehouse'],
        [move.installedSign, installedColumn, 'installed'],
      ]) {
        if (sign === 0) continue;
        const op = sign < 0 ? '-' : '+';
        // The subset CHECK also protects the installed column from overshooting
        // the showroom total, so a guard is only needed on the way down.
        const guard = sign < 0 ? `AND ${column} >= $1` : '';
        const rows = await tx(
          `UPDATE stock_items SET ${column} = ${column} ${op} $1, updated_at = NOW()
            WHERE id = $2 ${guard} RETURNING id`,
          [qty, itemId]
        );
        if (!rows[0]) {
          const have = isStone ? toSqft(item[column]) : Number(item[column] || 0);
          throw Object.assign(
            new Error(`Only ${have} ${unit} ${where} for ${item.sku}, cannot move ${qty}.`),
            { status: 400 }
          );
        }
      }

      const movementRows = await tx(
        `INSERT INTO stock_movements (
           movement_number, movement_type, direction, item_id, location_id,
           quantity, quantity_sqft, source_type, notes, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          generateReference('SHR'),
          move.movementType,
          move.direction,
          itemId,
          showroomLocationId,
          isStone ? 0 : qty,
          isStone ? qty : 0,
          // Both showroom moves are transfer_out, so the state lives here —
          // it is what lets the log tell a cassette move from an installed one.
          move.sourceType,
          notes,
          session.user.email,
        ]
      );

      return { movement: movementRows[0], item, qty, unit, label: move.label };
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'movement',
      entityId: result.movement.id,
      userId: session.user.sub,
      userEmail: session.user.email,
      changes: { new: result.movement },
      details: `${result.label}: ${result.qty} ${result.unit} of ${result.item.sku}`,
      request,
    });

    return NextResponse.json({ movement: result.movement }, { status: 201 });
  } catch (error) {
    const status = error?.status || 500;
    if (status === 500) console.error('Error recording showroom movement:', error);
    return NextResponse.json(
      { error: status === 500 ? 'Failed to record showroom movement' : error.message },
      { status }
    );
  }
}

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ movements: [], total: 0 }, { status: 503 });
  }

  // Any provisioned stock user can read the log; only WRITE_ROLES can add to it.
  if (!appUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const itemIdParam = searchParams.get('itemId');
    const itemId = itemIdParam ? Number(itemIdParam) : null;
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const showroomLocationId = await getShowroomLocationId();
    if (!showroomLocationId) {
      return NextResponse.json({ movements: [], total: 0 });
    }

    const [movements, countRows] = await Promise.all([
      sql(
        `SELECT m.id, m.movement_number, m.movement_type, m.direction,
                m.quantity, m.quantity_sqft, m.source_type, m.notes,
                m.created_by, m.created_at,
                i.sku, i.name, i.unit_of_measure
           FROM stock_movements m
           JOIN stock_items i ON i.id = m.item_id
          WHERE m.location_id = $1
            AND m.source_type LIKE 'showroom%'
            AND ($2::bigint IS NULL OR m.item_id = $2)
          ORDER BY m.created_at DESC
          LIMIT $3 OFFSET $4`,
        [showroomLocationId, itemId, limit, offset]
      ),
      sql(
        `SELECT COUNT(*)::int AS total FROM stock_movements
          WHERE location_id = $1 AND source_type LIKE 'showroom%'
            AND ($2::bigint IS NULL OR item_id = $2)`,
        [showroomLocationId, itemId]
      ),
    ]);

    return NextResponse.json({ movements, total: countRows[0]?.total || 0 });
  } catch (error) {
    console.error('Error fetching showroom movements:', error);
    return NextResponse.json({ error: 'Failed to fetch showroom movements' }, { status: 500 });
  }
}
