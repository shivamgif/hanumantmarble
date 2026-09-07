/**
 * Showroom stock movements.
 *
 * Stock sent to the showroom for display is still owned and still sellable, but
 * it is not in the warehouse — so it moves out of stock_items.current_* into the
 * parallel showroom_* counters rather than staying put and inflating the
 * warehouse number. Material stuck down as flooring is written off out of
 * showroom_* and survives only as the stock_movements row this route writes.
 *
 * POST /api/stock/movements  { itemId, action, qty, notes, locationId }
 * GET  /api/stock/movements  ?itemId=&limit=&offset=
 *
 * Display stock is now PER SHOWROOM, in stock_showroom_stock (item_id,
 * location_id). The stock_items.showroom_* columns are kept as a company-wide
 * ROLLUP, written in the same transaction, because every other reader — the
 * dispatch availability hint above all — asks "is any of this on display
 * anywhere", not "at which branch". Both are updated under the same advisory
 * lock so they cannot drift; scripts/check-showroom-reconcile.mjs asserts it.
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

/**
 * Which showroom this move is for.
 *
 * An explicit locationId must be an ACTIVE showroom-type location — sending
 * display stock to a warehouse or a retired branch is a mistake, not a move.
 * With none given, fall back to the oldest showroom, which is what every
 * pre-multi-branch caller means and keeps existing clients working.
 *
 * No cache any more: the answer now depends on the request, and a stale id
 * would silently post stock to the wrong branch.
 */
async function resolveShowroomLocation(locationId) {
  if (locationId !== undefined && locationId !== null && locationId !== '') {
    const id = Number(locationId);
    if (!Number.isInteger(id) || id <= 0) return { error: 'Invalid locationId' };
    const rows = await sql(
      `SELECT id, name FROM stock_locations
        WHERE id = $1 AND location_type = 'showroom' AND is_active`,
      [id]
    );
    if (!rows[0]) return { error: 'That branch is not an active showroom' };
    return { location: rows[0] };
  }

  const rows = await sql(
    `SELECT id, name FROM stock_locations
      WHERE location_type = 'showroom' AND is_active ORDER BY id LIMIT 1`,
    []
  );
  return rows[0] ? { location: rows[0] } : { error: null };
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
    if (!schemaCaps.hasShowroomStock || !schemaCaps.hasShowroomInstalled) {
      return NextResponse.json(
        { error: 'Showroom stock is not set up. Run the migrations in scripts/migrations/2026-09-0*-showroom-*.sql' },
        { status: 503 }
      );
    }

    const resolved = await resolveShowroomLocation(body.locationId);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    if (!resolved.location) {
      return NextResponse.json(
        { error: 'No active showroom exists. Add one in Attendance → Settings → Branches.' },
        { status: 503 }
      );
    }
    const showroomLocationId = Number(resolved.location.id);
    const showroomLocationName = resolved.location.name;

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

      // What is on display AT THIS BRANCH. Availability has to be judged here,
      // not on the company-wide rollup: with two showrooms the rollup would
      // happily authorise moving stock out of a branch that has none of it.
      const branchRows = await tx(
        `SELECT whole_qty, sqft, installed_whole_qty, installed_sqft
           FROM stock_showroom_stock WHERE item_id = $1 AND location_id = $2`,
        [itemId, showroomLocationId]
      );
      const branch = branchRows[0] || {
        whole_qty: 0, sqft: 0, installed_whole_qty: 0, installed_sqft: 0,
      };

      // All unit/column/sign branching lives in resolveShowroomMove so it can be
      // asserted without a DB — see scripts/check-showroom-move.mjs.
      const move = resolveShowroomMove({
        move: moveKey,
        unitOfMeasure: item.unit_of_measure,
        qty: body.qty,
      });
      const {
        isStone, warehouseColumn, showroomColumn, installedColumn,
        branchShowroomColumn, branchInstalledColumn, qty, unit,
      } = move;

      // showroomSplit reads the stock_items column names, so present the branch
      // row in that shape rather than duplicating the stone/whole branching.
      const split = showroomSplit({
        unit_of_measure: item.unit_of_measure,
        showroom_whole_qty: branch.whole_qty,
        showroom_sqft: branch.sqft,
        showroom_installed_whole_qty: branch.installed_whole_qty,
        showroom_installed_sqft: branch.installed_sqft,
      });

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
            `Only ${split.cassette} ${unit} is on a cassette for ${item.sku} at ${showroomLocationName}` +
            (split.installed > 0 ? ` (${split.installed} is installed as flooring)` : '') +
            `, cannot move ${qty}.`
          ),
          { status: 400 }
        );
      }
      if (move.installedSign < 0 && qty > split.installed) {
        throw Object.assign(
          new Error(`Only ${split.installed} ${unit} is installed for ${item.sku} at ${showroomLocationName}, cannot move ${qty} back to a cassette.`),
          { status: 400 }
        );
      }

      // Guarded decrements — the `>= $1` in the WHERE is what makes
      // over-transfer impossible even under a lost race. No row back means the
      // stock wasn't there.
      for (const [sign, column, branchColumn, where] of [
        [move.showroomSign, showroomColumn, branchShowroomColumn, `at ${showroomLocationName}`],
        [move.warehouseSign, warehouseColumn, null, 'at the warehouse'],
        [move.installedSign, installedColumn, branchInstalledColumn, 'installed'],
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

        // The per-branch row, in the same transaction so the rollup above can
        // never disagree with the sum of the branches.
        if (!branchColumn) continue;
        if (sign > 0) {
          // First move of this item to this branch has no row yet.
          await tx(
            `INSERT INTO stock_showroom_stock (item_id, location_id, ${branchColumn})
             VALUES ($1, $2, $3)
             ON CONFLICT (item_id, location_id) DO UPDATE
               SET ${branchColumn} = stock_showroom_stock.${branchColumn} + $3, updated_at = NOW()`,
            [itemId, showroomLocationId, qty]
          );
        } else {
          const branchRes = await tx(
            `UPDATE stock_showroom_stock SET ${branchColumn} = ${branchColumn} - $1, updated_at = NOW()
              WHERE item_id = $2 AND location_id = $3 AND ${branchColumn} >= $1
              RETURNING id`,
            [qty, itemId, showroomLocationId]
          );
          if (!branchRes[0]) {
            throw Object.assign(
              new Error(`Only ${split.total} ${unit} of ${item.sku} is at ${showroomLocationName}, cannot move ${qty}.`),
              { status: 400 }
            );
          }
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
