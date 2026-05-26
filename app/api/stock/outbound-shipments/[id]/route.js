import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, generateReference, getStockContext, hasAnyStockRole, normalizeStockRole, queueNotification, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql, withTransaction } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import {
  isPieceSale,
  totalPieces,
  computePieceDecrement,
  computePieceIncrement,
} from '@/lib/stock-piece-balance';

async function loadShipmentWithItems(id) {
  const schemaCaps = await getStockSchemaCapabilities();
  const salespersonUserSelect = schemaCaps.hasOutboundSalespersonUserId
    ? `sos.salesperson_user_id,
            spu.name AS salesperson_user_name,
            spu.division_id AS salesperson_user_division_id,
            sd.name AS salesperson_user_division_name,`
    : `NULL::bigint AS salesperson_user_id,
            NULL::text AS salesperson_user_name,
            NULL::bigint AS salesperson_user_division_id,
            NULL::text AS salesperson_user_division_name,`;
  const salespersonUserJoins = schemaCaps.hasOutboundSalespersonUserId
    ? `LEFT JOIN stock_app_users spu ON spu.id = sos.salesperson_user_id
     LEFT JOIN stock_divisions sd ON sd.id = spu.division_id`
    : '';

  const salespersonNameExpr = schemaCaps.hasOutboundSalespersonUserId
    ? 'COALESCE(spu.name, sp.name)'
    : 'sp.name';

  const shipmentRows = await sql(
    `SELECT sos.*,
            sos.truck_license_plate_snapshot AS truck_license_plate,
            sos.driver_name_snapshot AS driver_name,
            c.name AS customer_name,
            c.phone AS customer_phone_number,
            ${salespersonNameExpr} AS salesperson_name,
            ${salespersonUserSelect}
            COALESCE(agg.total_whole_qty, 0) AS total_whole_qty,
            COALESCE(agg.total_broken_qty, 0) AS total_broken_qty,
            COALESCE(agg.total_return_whole_qty, 0) AS total_return_whole_qty,
            COALESCE(agg.total_return_broken_qty, 0) AS total_return_broken_qty,
            COALESCE(agg.total_selling_price_excl, 0) AS total_selling_price_excl
     FROM stock_outbound_shipments sos
     LEFT JOIN stock_customers c ON c.id = sos.customer_id
     LEFT JOIN stock_sales_people sp ON sp.id = sos.salesperson_id
     ${salespersonUserJoins}
     LEFT JOIN (
       SELECT outbound_shipment_id,
              SUM(loaded_whole_qty) AS total_whole_qty,
              SUM(loaded_broken_qty) AS total_broken_qty,
              SUM(returned_whole_qty) AS total_return_whole_qty,
              SUM(returned_broken_qty) AS total_return_broken_qty,
              COALESCE(SUM(GREATEST(COALESCE(loaded_whole_qty, 0) - COALESCE(returned_whole_qty, 0), 0) * COALESCE(rate_per_unit, 0)), 0) AS total_selling_price_excl
       FROM stock_outbound_shipment_items
       WHERE outbound_shipment_id = $1
       GROUP BY outbound_shipment_id
     ) agg ON agg.outbound_shipment_id = sos.id
     WHERE sos.id = $1
     LIMIT 1`,
    [id]
  );
  const shipment = shipmentRows[0] || null;

  if (!shipment) {
    return { shipment: null, items: [] };
  }

  const items = await sql(
    `SELECT soi.*, i.sku, i.name AS item_name, i.unit_of_measure,
            ${schemaCaps.hasStockItemsWeightPerUnitKg ? 'i.weight_per_unit_kg,' : 'NULL AS weight_per_unit_kg,'}
            t.name AS type_name,
            i.current_whole_qty, i.current_broken_qty
     FROM stock_outbound_shipment_items soi
     JOIN stock_items i ON i.id = soi.item_id
     LEFT JOIN stock_types t ON t.id = i.type_id
     WHERE soi.outbound_shipment_id = $1
     ORDER BY soi.created_at ASC`,
    [id]
  );

  return { shipment, items };
}

function toPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function createValidationError(message, reasonCode) {
  const error = new Error(message);
  error.statusCode = 400;
  error.reasonCode = reasonCode;
  return error;
}

async function resolveDispatchSalespersonUserTx(tx, body) {
  const salespersonUserId = Number(body.salespersonUserId || 0);
  if (!salespersonUserId || !Number.isFinite(salespersonUserId)) {
    throw createValidationError('Select a salesperson from the list.', 'salesperson_missing');
  }

  const rows = await tx(
    `SELECT u.id, u.name,
       ARRAY_AGG(ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL) AS division_ids,
       STRING_AGG(d.name, ', ' ORDER BY d.name) AS division_names
     FROM stock_app_users u
     LEFT JOIN stock_user_divisions ud ON ud.user_id = u.id
     LEFT JOIN stock_divisions d ON d.id = ud.division_id
     WHERE u.id = $1
       AND u.role = 'salesperson'
       AND u.status = 'active'
     GROUP BY u.id
     LIMIT 1`,
    [salespersonUserId]
  );

  const salespersonUser = rows[0] || null;
  if (!salespersonUser) {
    throw createValidationError('Selected salesperson is invalid or inactive.', 'salesperson_invalid');
  }
  if (!salespersonUser.division_ids?.length) {
    throw createValidationError('Selected salesperson has no division assigned.', 'salesperson_division_missing');
  }

  return salespersonUser;
}

async function validateDispatchDivisionIntegrityTx(tx, items, salespersonUser) {
  const itemIds = items.map((item) => Number(item.itemId)).filter(Boolean);
  const itemRows = itemIds.length
    ? await tx(
        `SELECT i.id, i.division_id, d.name AS division_name
         FROM stock_items i
         LEFT JOIN stock_divisions d ON d.id = i.division_id
         WHERE i.id = ANY($1::bigint[])`,
        [itemIds]
      )
    : [];

  if (itemRows.length !== itemIds.length) {
    throw createValidationError('One or more dispatch items could not be resolved.', 'item_not_found');
  }

  const rowById = new Map(itemRows.map((row) => [Number(row.id), row]));
  const orderedRows = itemIds.map((id) => rowById.get(id));
  if (orderedRows.some((row) => !row?.division_id)) {
    throw createValidationError('Each dispatch item must belong to a division.', 'item_division_missing');
  }

  const itemDivisionIds = [...new Set(orderedRows.map((row) => Number(row.division_id)))];

  const salespersonDivisionIds = (salespersonUser.division_ids || []).map(Number);
  const unauthorizedDivisions = itemDivisionIds.filter((divId) => !salespersonDivisionIds.includes(divId));
  if (unauthorizedDivisions.length > 0) {
    throw createValidationError('Dispatch items contain divisions not assigned to this salesperson.', 'division_mismatch');
  }

  return {
    itemIds,
    itemDivisionIds,
    itemDivisionNames: [...new Set(orderedRows.map((row) => row.division_name || `Division ${row.division_id}`))],
    salespersonDivisionIds,
    salespersonDivisionNames: salespersonUser.division_names || null,
  };
}

async function recordDivisionValidationTimeline({
  appUser,
  entityId = null,
  shipmentNumber = null,
  outcome,
  reasonCode = null,
  salespersonUser = null,
  validation = null,
}) {
  try {
    await recordTimelineEvent({
      eventType: 'other',
      entityType: 'outbound_shipment',
      entityId,
      summary: `Dispatch division validation ${outcome}`,
      details: {
        division_validation: outcome,
        reason_code: reasonCode,
        shipmentNumber,
        actor: {
          userId: appUser?.id || null,
          role: normalizeStockRole(appUser?.role),
          email: appUser?.email || null,
        },
        salesperson: salespersonUser ? {
          id: Number(salespersonUser.id),
          name: salespersonUser.name,
          divisionIds: (salespersonUser.division_ids || []).map(Number),
          divisionNames: salespersonUser.division_names || null,
        } : null,
        itemIds: validation?.itemIds || [],
        itemDivisionIds: validation?.itemDivisionIds || [],
        itemDivisionNames: validation?.itemDivisionNames || [],
      },
      userId: appUser?.id || null,
    });
  } catch (error) {
    console.error('Failed to record dispatch division validation timeline:', error);
  }
}

async function applyShipmentApproval(shipmentId, session, appUser, idempotencyKey) {
  return withTransaction(async (tx) => {
    // Serialize approval for the same shipment to prevent concurrent decrements.
    await tx(
      `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
      [`stock_outbound_approval:${shipmentId}`]
    );

    const shipmentRows = await tx(
      `SELECT *
       FROM stock_outbound_shipments
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [shipmentId]
    );

    const shipment = shipmentRows[0] || null;

    if (!shipment) {
      throw new Error('Shipment not found');
    }

    const items = await tx(
      `SELECT soi.*, i.sku, i.name AS item_name, i.unit_of_measure,
              i.current_whole_qty, i.current_broken_qty,
              i.pieces_per_box, i.current_piece_remainder, i.current_broken_piece_remainder
       FROM stock_outbound_shipment_items soi
       JOIN stock_items i ON i.id = soi.item_id
       WHERE soi.outbound_shipment_id = $1
       ORDER BY soi.created_at ASC
       FOR UPDATE OF i`,
      [shipmentId]
    );

    if (shipment.approval_status === 'approved') {
      return { shipment, items, idempotent: true, idempotencyKey };
    }

    const batchPromises = [];

    for (const item of items) {
      const wholeToIssue = toPositiveInteger(item.loaded_whole_qty);
      const brokenToIssue = toPositiveInteger(item.loaded_broken_qty);

      if (wholeToIssue > 0) {
        const ppb = Number(item.pieces_per_box || 0);
        const pieceMode = isPieceSale(item.sell_unit, ppb);

        if (pieceMode) {
          const availPieces = totalPieces(item.current_whole_qty, item.current_piece_remainder, ppb);
          if (availPieces < wholeToIssue) {
            throw new Error(`Insufficient stock for ${item.sku}: need ${wholeToIssue} pieces, have ${availPieces}`);
          }
          const { boxDelta, remainderTarget } = computePieceDecrement({
            pieces: wholeToIssue,
            currentWholeQty: item.current_whole_qty,
            currentPieceRemainder: item.current_piece_remainder,
            piecesPerBox: ppb,
          });
          const wholeUpdateRows = await tx(
            `UPDATE stock_items
             SET current_whole_qty = current_whole_qty - $1,
                 current_piece_remainder = $2,
                 updated_at = NOW()
             WHERE id = $3
               AND current_whole_qty >= $1
             RETURNING id`,
            [boxDelta, remainderTarget, item.item_id]
          );
          if (!wholeUpdateRows[0]) {
            throw new Error(`Insufficient whole stock for ${item.sku}. Race condition detected.`);
          }
        } else {
          if (Number(item.current_whole_qty || 0) < wholeToIssue) {
            throw new Error(`Insufficient whole stock for ${item.sku}`);
          }
          const wholeUpdateRows = await tx(
            `UPDATE stock_items
             SET current_whole_qty = current_whole_qty - $1,
                 updated_at = NOW()
             WHERE id = $2
               AND current_whole_qty >= $1
             RETURNING id`,
            [wholeToIssue, item.item_id]
          );
          if (!wholeUpdateRows[0]) {
            throw new Error(`Insufficient whole stock for ${item.sku}. Race condition detected.`);
          }
        }

        batchPromises.push(tx(
          `INSERT INTO stock_movements (
            movement_number, movement_type, direction, item_id, quantity, tile_condition,
            source_type, source_id, reference_number, notes, created_by
          ) VALUES ($1, 'sale_issue', 'out', $2, $3, 'whole', 'outbound_shipment', $4, $5, $6, $7)`,
          [
            `MOV-${shipment.shipment_number}-${item.item_id}-W`,
            item.item_id,
            wholeToIssue,
            shipment.id,
            shipment.invoice_number || shipment.gatepass_number || shipment.shipment_number,
            `Dispatch approved for ${shipment.shipment_number}`,
            session.user.email,
          ]
        ));
      }

      if (brokenToIssue > 0) {
        const ppbB = Number(item.pieces_per_box || 0);
        const pieceModeB = isPieceSale(item.sell_unit, ppbB);

        if (pieceModeB) {
          const availPieces = totalPieces(item.current_broken_qty, item.current_broken_piece_remainder, ppbB);
          if (availPieces < brokenToIssue) {
            throw new Error(`Insufficient broken stock for ${item.sku}: need ${brokenToIssue} pieces, have ${availPieces}`);
          }
          const { boxDelta, remainderTarget } = computePieceDecrement({
            pieces: brokenToIssue,
            currentWholeQty: item.current_broken_qty,
            currentPieceRemainder: item.current_broken_piece_remainder,
            piecesPerBox: ppbB,
          });
          const brokenUpdateRows = await tx(
            `UPDATE stock_items
             SET current_broken_qty = current_broken_qty - $1,
                 current_broken_piece_remainder = $2,
                 updated_at = NOW()
             WHERE id = $3
               AND current_broken_qty >= $1
             RETURNING id`,
            [boxDelta, remainderTarget, item.item_id]
          );
          if (!brokenUpdateRows[0]) {
            throw new Error(`Insufficient broken stock for ${item.sku}. Race condition detected.`);
          }
        } else {
          if (Number(item.current_broken_qty || 0) < brokenToIssue) {
            throw new Error(`Insufficient broken stock for ${item.sku}`);
          }
          const brokenUpdateRows = await tx(
            `UPDATE stock_items
             SET current_broken_qty = current_broken_qty - $1,
                 updated_at = NOW()
             WHERE id = $2
               AND current_broken_qty >= $1
             RETURNING id`,
            [brokenToIssue, item.item_id]
          );
          if (!brokenUpdateRows[0]) {
            throw new Error(`Insufficient broken stock for ${item.sku}. Race condition detected.`);
          }
        }

        batchPromises.push(tx(
          `INSERT INTO stock_movements (
            movement_number, movement_type, direction, item_id, quantity, tile_condition,
            source_type, source_id, reference_number, notes, created_by
          ) VALUES ($1, 'sale_issue', 'out', $2, $3, 'broken', 'outbound_shipment', $4, $5, $6, $7)`,
          [
            `MOV-${shipment.shipment_number}-${item.item_id}-B`,
            item.item_id,
            brokenToIssue,
            shipment.id,
            shipment.invoice_number || shipment.gatepass_number || shipment.shipment_number,
            `Dispatch approved for ${shipment.shipment_number}`,
            session.user.email,
          ]
        ));
      }
    }

    await Promise.all(batchPromises);

    const updatedRows = await tx(
      `UPDATE stock_outbound_shipments
       SET approval_status = 'approved',
           status = 'dispatched',
           approved_at = NOW(),
           approved_by_user_id = $1,
           reviewed_at = COALESCE(reviewed_at, NOW()),
           reviewed_by_user_id = COALESCE(reviewed_by_user_id, $1),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [appUser?.id || null, shipmentId]
    );

    return { shipment: updatedRows[0], items, idempotent: false, idempotencyKey };
  });
}

export async function GET(request, context) {
  const { session, appUser } = await getStockContext(request);

  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer', 'salesperson'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const includeDocs = searchParams.get('includeDocs') === 'true';

    const { shipment, items } = await loadShipmentWithItems(id);

    let documents = [];
    if (includeDocs) {
      documents = await sql(
        `SELECT id, document_type, file_name, file_url, document_number, created_at, notes, mime_type
         FROM stock_documents
         WHERE entity_type = 'outbound_shipment' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [id]
      );
    }

    return NextResponse.json({ shipment, items, documents });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load shipment', detail: error.message }, { status: 500 });
  }
}

export async function PATCH(request, context) {
  const { session, appUser } = await getStockContext(request);
  let shipmentIdForLogging = null;

  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  if (!hasAnyStockRole(appUser, ['admin', 'manager'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    shipmentIdForLogging = id;
    const body = await request.json();
    const action = body.action || 'update';

    if (action === 'approve') {
      const requestIdempotencyKey = String(
        body?.idempotencyKey || request.headers.get('x-idempotency-key') || `outbound-shipment-${id}`
      ).trim();

      const result = await applyShipmentApproval(id, session, appUser, requestIdempotencyKey);
      const warnings = [];

      try {
        await recordTimelineEvent({
          eventType: 'outbound_approved',
          entityType: 'outbound_shipment',
          entityId: id,
          summary: 'Outbound shipment approved',
          details: { shipmentId: id },
          userId: appUser?.id || null,
        });
      } catch (timelineError) {
        console.error('Failed to record outbound approval timeline event:', timelineError);
        warnings.push('Timeline entry could not be saved.');
      }

      try {
        await queueNotification({
          channel: 'whatsapp',
          eventType: 'outbound_dispatch',
          messageText: `Stock dispatch approved: ${result.shipment.shipment_number}.`,
          recipients: [],
          sourceTable: 'stock_outbound_shipments',
          sourceId: id,
          createdBy: session.user.email,
        });
      } catch (notificationError) {
        console.error('Failed to queue outbound approval notification:', notificationError);
        warnings.push('Notification could not be queued.');
      }

      return NextResponse.json({
        shipment: result.shipment,
        items: result.items,
        warnings,
        idempotent: Boolean(result.idempotent),
        idempotencyKey: result.idempotencyKey,
      });
    }

    if (action === 'reject') {
      const rows = await sql(
        `UPDATE stock_outbound_shipments
         SET approval_status = 'rejected',
             status = 'cancelled',
             approval_notes = $1,
             reviewed_at = NOW(),
             reviewed_by_user_id = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [body.notes || null, appUser?.id || null, id]
      );

      await recordTimelineEvent({
        eventType: 'change_rejected',
        entityType: 'outbound_shipment',
        entityId: id,
        summary: 'Outbound shipment rejected',
        details: { notes: body.notes || null },
        userId: appUser?.id || null,
      });

      return NextResponse.json({ shipment: rows[0] });
    }

    if (action === 'request_changes') {
      const changeRequestRows = await sql(
        `INSERT INTO stock_change_requests (
          request_number,
          source_entity_type,
          source_entity_id,
          request_type,
          requested_changes,
          original_snapshot,
          reason,
          requested_by_user_id,
          requested_by_name,
          priority,
          requires_higher_level_approval
        ) VALUES ($1, 'outbound_shipment', $2, 'correct', $3, $4, $5, $6, $7, $8, TRUE)
        RETURNING *`,
        [
          generateReference('CHR'),
          id,
          JSON.stringify(body.requestedChanges || {}),
          JSON.stringify(body.originalSnapshot || {}),
          body.reason || 'Requested dispatch correction',
          appUser?.id || null,
          appUser?.name || session.user.name || session.user.email,
          body.priority || 'normal',
        ]
      );

      const rows = await sql(
        `UPDATE stock_outbound_shipments
         SET approval_status = 'changes_requested',
             approval_notes = $1,
             reviewed_at = NOW(),
             reviewed_by_user_id = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [body.reason || 'Change requested', appUser?.id || null, id]
      );

      await recordTimelineEvent({
        eventType: 'change_requested',
        entityType: 'outbound_shipment',
        entityId: id,
        summary: 'Change requested for outbound shipment',
        details: { requestId: changeRequestRows[0].id },
        userId: appUser?.id || null,
      });

      return NextResponse.json({ shipment: rows[0], changeRequest: changeRequestRows[0] });
    }

    if (action === 'update_payment') {
      const { paymentStatus } = body;
      if (!paymentStatus) {
        return NextResponse.json({ error: 'paymentStatus is required' }, { status: 400 });
      }
      const rows = await sql(
        `UPDATE stock_outbound_shipments
         SET payment_status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [paymentStatus, id]
      );
      if (!rows[0]) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
      await recordTimelineEvent({
        eventType: 'other',
        entityType: 'outbound_shipment',
        entityId: id,
        summary: `Payment status updated to ${paymentStatus}`,
        details: { paymentStatus },
        userId: appUser?.id || null,
      });
      return NextResponse.json({ shipment: rows[0] });
    }

    const result = await withTransaction(async (tx) => {
      const schemaCaps = await getStockSchemaCapabilities();
      // Mutability guard: approved outbound shipments have already deducted stock.
      // Post-approval, only return-qty edits are permitted; they credit stock back via delta.
      const existingRows = await tx(
        `SELECT id, approval_status, locked_at, shipment_number, invoice_number
         FROM stock_outbound_shipments WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const existing = existingRows[0];
      if (!existing) {
        throw new Error('Shipment not found');
      }
      if (existing.approval_status === 'approved' || existing.locked_at) {
        if (!Array.isArray(body.items)) {
          const err = new Error('Cannot modify an approved or locked outbound shipment');
          err.statusCode = 409;
          throw err;
        }

        const currentItems = await tx(
          `SELECT soi.id, soi.item_id, soi.loaded_whole_qty, soi.loaded_broken_qty,
                  soi.returned_whole_qty, soi.returned_broken_qty, soi.sell_unit,
                  i.pieces_per_box, i.current_whole_qty, i.current_piece_remainder,
                  i.current_broken_qty, i.current_broken_piece_remainder
           FROM stock_outbound_shipment_items soi
           JOIN stock_items i ON i.id = soi.item_id
           WHERE soi.outbound_shipment_id = $1
           FOR UPDATE OF soi, i`,
          [id]
        );
        const byItemId = new Map(currentItems.map((row) => [Number(row.item_id), row]));
        const submittedIds = body.items
          .map((it) => Number(it.itemId))
          .filter((n) => Number.isFinite(n) && n > 0);
        const submittedSet = new Set(submittedIds);
        if (submittedSet.size !== currentItems.length
            || [...submittedSet].some((itemId) => !byItemId.has(itemId))) {
          const err = new Error('Cannot add or remove items on an approved dispatch; only return quantities may be updated');
          err.statusCode = 409;
          throw err;
        }

        for (const it of body.items) {
          const existingRow = byItemId.get(Number(it.itemId));
          if (!existingRow) continue;

          const loadedWhole = Number(existingRow.loaded_whole_qty || 0);
          const loadedBroken = Number(existingRow.loaded_broken_qty || 0);
          const isBagItem = it.itemCategory === 'bag';
          const newWholeReturn = isBagItem
            ? toPositiveInteger(it.returnQtyBags ?? it.returnWholeQty)
            : toPositiveInteger(it.returnWholeQty);
          const newBrokenReturn = isBagItem ? 0 : toPositiveInteger(it.returnBrokenQty);

          // Disallow loaded-qty mutation on approved dispatches
          if (it.loadedWholeQty != null) {
            const submittedLoadedWhole = isBagItem
              ? toPositiveInteger(it.qtyBags)
              : toPositiveInteger(it.loadedWholeQty);
            if (submittedLoadedWhole !== loadedWhole) {
              const err = new Error('Cannot change loaded quantity on an approved dispatch');
              err.statusCode = 409;
              throw err;
            }
          }
          if (it.loadedBrokenQty != null && !isBagItem) {
            if (toPositiveInteger(it.loadedBrokenQty) !== loadedBroken) {
              const err = new Error('Cannot change loaded quantity on an approved dispatch');
              err.statusCode = 409;
              throw err;
            }
          }

          if (newWholeReturn > loadedWhole) {
            const err = new Error(`Return whole qty ${newWholeReturn} exceeds loaded ${loadedWhole}`);
            err.statusCode = 400;
            throw err;
          }
          if (newBrokenReturn > loadedBroken) {
            const err = new Error(`Return broken qty ${newBrokenReturn} exceeds loaded ${loadedBroken}`);
            err.statusCode = 400;
            throw err;
          }

          const oldWholeReturn = Number(existingRow.returned_whole_qty || 0);
          const oldBrokenReturn = Number(existingRow.returned_broken_qty || 0);
          const deltaWhole = newWholeReturn - oldWholeReturn;
          const deltaBroken = newBrokenReturn - oldBrokenReturn;

          if (deltaWhole !== 0) {
            const ppb = Number(existingRow.pieces_per_box || 0);
            const pieceMode = isPieceSale(existingRow.sell_unit, ppb);

            if (pieceMode) {
              // deltaWhole here is a piece-count delta. Positive = additional return (credit pieces back),
              // negative = return reduced (re-debit pieces).
              let boxAdj = 0;
              let newRemainder = Number(existingRow.current_piece_remainder || 0);
              if (deltaWhole > 0) {
                const inc = computePieceIncrement({
                  pieces: deltaWhole,
                  currentWholeQty: existingRow.current_whole_qty,
                  currentPieceRemainder: existingRow.current_piece_remainder,
                  piecesPerBox: ppb,
                });
                boxAdj = inc.boxDelta;
                newRemainder = inc.remainderTarget;
                const rows = await tx(
                  `UPDATE stock_items
                   SET current_whole_qty = current_whole_qty + $1,
                       current_piece_remainder = $2,
                       updated_at = NOW()
                   WHERE id = $3
                   RETURNING id`,
                  [boxAdj, newRemainder, existingRow.item_id]
                );
                if (!rows[0]) {
                  const err = new Error(`Stock adjustment for item ${existingRow.item_id} failed`);
                  err.statusCode = 400;
                  throw err;
                }
              } else {
                const availPieces = totalPieces(existingRow.current_whole_qty, existingRow.current_piece_remainder, ppb);
                const needed = -deltaWhole;
                if (availPieces < needed) {
                  const err = new Error(`Stock adjustment for item ${existingRow.item_id} would go negative`);
                  err.statusCode = 400;
                  throw err;
                }
                const dec = computePieceDecrement({
                  pieces: needed,
                  currentWholeQty: existingRow.current_whole_qty,
                  currentPieceRemainder: existingRow.current_piece_remainder,
                  piecesPerBox: ppb,
                });
                boxAdj = -dec.boxDelta;
                newRemainder = dec.remainderTarget;
                const rows = await tx(
                  `UPDATE stock_items
                   SET current_whole_qty = current_whole_qty + $1,
                       current_piece_remainder = $2,
                       updated_at = NOW()
                   WHERE id = $3 AND current_whole_qty + $1 >= 0
                   RETURNING id`,
                  [boxAdj, newRemainder, existingRow.item_id]
                );
                if (!rows[0]) {
                  const err = new Error(`Stock adjustment for item ${existingRow.item_id} would go negative`);
                  err.statusCode = 400;
                  throw err;
                }
              }
            } else {
              const rows = await tx(
                `UPDATE stock_items
                 SET current_whole_qty = current_whole_qty + $1,
                     updated_at = NOW()
                 WHERE id = $2 AND current_whole_qty + $1 >= 0
                 RETURNING id`,
                [deltaWhole, existingRow.item_id]
              );
              if (!rows[0]) {
                const err = new Error(`Stock adjustment for item ${existingRow.item_id} would go negative`);
                err.statusCode = 400;
                throw err;
              }
            }

            await tx(
              `INSERT INTO stock_movements (
                movement_number, movement_type, direction, item_id, quantity, tile_condition,
                source_type, source_id, reference_number, notes, created_by
              ) VALUES ($1, $2, $3, $4, $5, 'whole', 'outbound_shipment', $6, $7, $8, $9)`,
              [
                `MOV-RET-${existing.shipment_number || id}-${existingRow.item_id}-W-${Date.now()}`,
                deltaWhole > 0 ? 'return_in' : 'return_out',
                deltaWhole > 0 ? 'in' : 'out',
                existingRow.item_id,
                Math.abs(deltaWhole),
                id,
                existing.invoice_number || existing.shipment_number || null,
                `Return adjustment for dispatch ${existing.shipment_number || id}`,
                appUser?.email || null,
              ]
            );
          }

          if (deltaBroken !== 0) {
            const ppbB = Number(existingRow.pieces_per_box || 0);
            const pieceModeB = isPieceSale(existingRow.sell_unit, ppbB);

            if (pieceModeB) {
              let boxAdj = 0;
              let newRem = Number(existingRow.current_broken_piece_remainder || 0);
              if (deltaBroken > 0) {
                const inc = computePieceIncrement({
                  pieces: deltaBroken,
                  currentWholeQty: existingRow.current_broken_qty,
                  currentPieceRemainder: existingRow.current_broken_piece_remainder,
                  piecesPerBox: ppbB,
                });
                boxAdj = inc.boxDelta;
                newRem = inc.remainderTarget;
                const rows = await tx(
                  `UPDATE stock_items
                   SET current_broken_qty = current_broken_qty + $1,
                       current_broken_piece_remainder = $2,
                       updated_at = NOW()
                   WHERE id = $3
                   RETURNING id`,
                  [boxAdj, newRem, existingRow.item_id]
                );
                if (!rows[0]) {
                  const err = new Error(`Stock adjustment for item ${existingRow.item_id} failed`);
                  err.statusCode = 400;
                  throw err;
                }
              } else {
                const availPieces = totalPieces(existingRow.current_broken_qty, existingRow.current_broken_piece_remainder, ppbB);
                const needed = -deltaBroken;
                if (availPieces < needed) {
                  const err = new Error(`Stock adjustment for item ${existingRow.item_id} would go negative`);
                  err.statusCode = 400;
                  throw err;
                }
                const dec = computePieceDecrement({
                  pieces: needed,
                  currentWholeQty: existingRow.current_broken_qty,
                  currentPieceRemainder: existingRow.current_broken_piece_remainder,
                  piecesPerBox: ppbB,
                });
                boxAdj = -dec.boxDelta;
                newRem = dec.remainderTarget;
                const rows = await tx(
                  `UPDATE stock_items
                   SET current_broken_qty = current_broken_qty + $1,
                       current_broken_piece_remainder = $2,
                       updated_at = NOW()
                   WHERE id = $3 AND current_broken_qty + $1 >= 0
                   RETURNING id`,
                  [boxAdj, newRem, existingRow.item_id]
                );
                if (!rows[0]) {
                  const err = new Error(`Stock adjustment for item ${existingRow.item_id} would go negative`);
                  err.statusCode = 400;
                  throw err;
                }
              }
            } else {
              const rows = await tx(
                `UPDATE stock_items
                 SET current_broken_qty = current_broken_qty + $1,
                     updated_at = NOW()
                 WHERE id = $2 AND current_broken_qty + $1 >= 0
                 RETURNING id`,
                [deltaBroken, existingRow.item_id]
              );
              if (!rows[0]) {
                const err = new Error(`Stock adjustment for item ${existingRow.item_id} would go negative`);
                err.statusCode = 400;
                throw err;
              }
            }
            await tx(
              `INSERT INTO stock_movements (
                movement_number, movement_type, direction, item_id, quantity, tile_condition,
                source_type, source_id, reference_number, notes, created_by
              ) VALUES ($1, $2, $3, $4, $5, 'broken', 'outbound_shipment', $6, $7, $8, $9)`,
              [
                `MOV-RET-${existing.shipment_number || id}-${existingRow.item_id}-B-${Date.now()}`,
                deltaBroken > 0 ? 'return_in' : 'return_out',
                deltaBroken > 0 ? 'in' : 'out',
                existingRow.item_id,
                Math.abs(deltaBroken),
                id,
                existing.invoice_number || existing.shipment_number || null,
                `Return adjustment for dispatch ${existing.shipment_number || id}`,
                appUser?.email || null,
              ]
            );
          }

          if (deltaWhole !== 0 || deltaBroken !== 0) {
            await tx(
              `UPDATE stock_outbound_shipment_items
               SET returned_whole_qty = $1,
                   returned_broken_qty = $2,
                   updated_at = NOW()
               WHERE id = $3`,
              [newWholeReturn, newBrokenReturn, existingRow.id]
            );
          }
        }

        const shipmentRows = await tx(
          `SELECT * FROM stock_outbound_shipments WHERE id = $1`,
          [id]
        );
        return {
          shipment: shipmentRows[0],
          divisionValidation: null,
          salespersonUser: null,
          returnOnly: true,
        };
      }

      // If item lines are being (re)set, verify each line's qty does not exceed
      // the current available stock for that item. Server-side authoritative check.
      if (body.items && Array.isArray(body.items)) {
        for (const item of body.items) {
          if (!item.itemId) continue;
          const wholeReq = toPositiveInteger(item.loadedWholeQty);
          const brokenReq = toPositiveInteger(item.loadedBrokenQty);
          if (wholeReq === 0 && brokenReq === 0) continue;
          const stockRows = await tx(
            `SELECT sku, current_whole_qty, current_broken_qty, pieces_per_box,
                    current_piece_remainder, current_broken_piece_remainder
             FROM stock_items WHERE id = $1`,
            [item.itemId]
          );
          const stock = stockRows[0];
          if (!stock) {
            throw new Error(`Item ${item.itemId} not found`);
          }
          const ppb = Number(stock.pieces_per_box || 0);
          const pieceMode = isPieceSale(item.sellUnit, ppb);
          if (pieceMode) {
            const availPieces = totalPieces(stock.current_whole_qty, stock.current_piece_remainder, ppb);
            if (wholeReq > availPieces) {
              const err = new Error(`Requested qty ${wholeReq} pieces exceeds available ${availPieces} for ${stock.sku}`);
              err.statusCode = 400;
              throw err;
            }
          } else if (wholeReq > Number(stock.current_whole_qty || 0)) {
            const err = new Error(`Requested whole qty ${wholeReq} exceeds available ${stock.current_whole_qty} for ${stock.sku}`);
            err.statusCode = 400;
            throw err;
          }
          if (brokenReq > 0) {
            if (pieceMode) {
              const availBrokenPieces = totalPieces(stock.current_broken_qty, stock.current_broken_piece_remainder, ppb);
              if (brokenReq > availBrokenPieces) {
                const err = new Error(`Requested broken qty ${brokenReq} pieces exceeds available ${availBrokenPieces} for ${stock.sku}`);
                err.statusCode = 400;
                throw err;
              }
            } else if (brokenReq > Number(stock.current_broken_qty || 0)) {
              const err = new Error(`Requested broken qty ${brokenReq} exceeds available ${stock.current_broken_qty} for ${stock.sku}`);
              err.statusCode = 400;
              throw err;
            }
          }
        }
      }

      // Resolve IDs from names if provided
      let resolvedCustomerId = null;
      let resolvedSalespersonId = null;
      let resolvedSalespersonUser = null;
      let divisionValidation = null;

      if (body.customerName) {
        const trimmedName = body.customerName.trim();
        const trimmedPhone = body.customerPhoneNumber?.trim() || null;
        let found = null;
        if (trimmedPhone) {
          const rows = await tx(
            'SELECT id FROM stock_customers WHERE lower(name) = lower($1) AND phone = $2 LIMIT 1',
            [trimmedName, trimmedPhone]
          );
          found = rows[0] || null;
        } else {
          const rows = await tx(
            'SELECT id FROM stock_customers WHERE lower(name) = lower($1) LIMIT 1',
            [trimmedName]
          );
          found = rows[0] || null;
        }
        if (!found) {
          const rows = await tx(
            'INSERT INTO stock_customers (name, phone) VALUES ($1, $2) RETURNING id',
            [trimmedName, trimmedPhone]
          );
          found = rows[0];
        }
        resolvedCustomerId = found?.id || null;
      }

      const requiresDivisionValidation = (body.items && Array.isArray(body.items) && body.items.length > 0)
        || Object.prototype.hasOwnProperty.call(body, 'salespersonUserId')
        || Object.prototype.hasOwnProperty.call(body, 'salespersonName');

      if (requiresDivisionValidation) {
        resolvedSalespersonUser = await resolveDispatchSalespersonUserTx(tx, body);
        if (resolvedSalespersonUser?.name) {
          const sRows = await tx(
            'SELECT id FROM stock_sales_people WHERE lower(name) = lower($1) LIMIT 1',
            [resolvedSalespersonUser.name.trim()]
          );
          resolvedSalespersonId = sRows[0]?.id || null;
        } else if (body.salespersonName) {
          const sRows = await tx(
            'SELECT id FROM stock_sales_people WHERE lower(name) = lower($1) LIMIT 1',
            [body.salespersonName.trim()]
          );
          resolvedSalespersonId = sRows[0]?.id || null;
        }
      }

      if (resolvedSalespersonUser) {
        if (body.items && Array.isArray(body.items) && body.items.length > 0) {
          divisionValidation = await validateDispatchDivisionIntegrityTx(tx, body.items, resolvedSalespersonUser);
        } else if (requiresDivisionValidation) {
          const existingItemRows = await tx(
            `SELECT item_id
             FROM stock_outbound_shipment_items
             WHERE outbound_shipment_id = $1
             ORDER BY id ASC`,
            [id]
          );
          const existingItemsPayload = existingItemRows.map((row) => ({ itemId: Number(row.item_id) }));
          if (existingItemsPayload.length > 0) {
            divisionValidation = await validateDispatchDivisionIntegrityTx(tx, existingItemsPayload, resolvedSalespersonUser);
          }
        }
      }

      const updateAssignments = [
        'shipment_number = COALESCE($1, shipment_number)',
        'customer_id = COALESCE($2, customer_id)',
        'truck_license_plate_snapshot = COALESCE($3, truck_license_plate_snapshot)',
        'truck_number_snapshot = COALESCE($4, truck_number_snapshot)',
        'driver_name_snapshot = COALESCE($5, driver_name_snapshot)',
        'invoice_number = COALESCE($6, invoice_number)',
        'dispatch_date = COALESCE($7, dispatch_date)',
        'transport_cost = COALESCE($8, transport_cost)',
        'loading_labour_cost = COALESCE($9, loading_labour_cost)',
        'notes = COALESCE($10, notes)',
        'salesperson_id = COALESCE($11, salesperson_id)',
      ];
      const updateValues = [
        body.shipmentNumber || null,
        resolvedCustomerId,
        body.truckLicensePlate || null,
        body.truckNumber || null,
        body.driverName || null,
        body.invoiceNumber || null,
        body.dispatchDate || null,
        body.transportCost ?? null,
        body.loadingLabourCost ?? null,
        body.notes || null,
        resolvedSalespersonId,
      ];

      if (schemaCaps.hasOutboundSalespersonUserId) {
        updateAssignments.push(`salesperson_user_id = COALESCE($${updateValues.length + 1}, salesperson_user_id)`);
        updateValues.push(resolvedSalespersonUser?.id ? Number(resolvedSalespersonUser.id) : null);
      }

      updateAssignments.push(`payment_status = COALESCE($${updateValues.length + 1}, payment_status)`);
      updateValues.push(body.paymentStatus || null);
      updateValues.push(id);

      const shipmentRows = await tx(
        `UPDATE stock_outbound_shipments
         SET ${updateAssignments.join(',\n             ')},
             updated_at = NOW()
         WHERE id = $${updateValues.length}
         RETURNING *`,
        updateValues
      );

      if (body.items && Array.isArray(body.items)) {
        // Delete existing items
        await tx(`DELETE FROM stock_outbound_shipment_items WHERE outbound_shipment_id = $1`, [id]);

        // Insert new items
        for (const item of body.items) {
          const isBagItem = item.itemCategory === 'bag';
          await tx(
            `INSERT INTO stock_outbound_shipment_items (
              outbound_shipment_id, item_id, loaded_whole_qty, loaded_broken_qty,
              returned_whole_qty, returned_broken_qty, sell_unit, rate_per_unit, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              id,
              item.itemId,
              isBagItem ? (item.qtyBags || 0) : (item.loadedWholeQty || 0),
              isBagItem ? 0 : (item.loadedBrokenQty || 0),
              item.returnWholeQty || 0,
              item.returnBrokenQty || 0,
              item.sellUnit || 'box',
              item.ratePerUnit != null && item.ratePerUnit !== '' ? Number(item.ratePerUnit) : null,
              item.notes || null,
            ]
          );
        }
      }

      return {
        shipment: shipmentRows[0],
        divisionValidation,
        salespersonUser: resolvedSalespersonUser,
      };
    });

    await recordTimelineEvent({
      eventType: 'other',
      entityType: 'outbound_shipment',
      entityId: id,
      summary: 'Outbound shipment updated',
      details: {
        division_validation: 'passed',
        actor: {
          userId: appUser?.id || null,
          role: normalizeStockRole(appUser?.role),
          email: appUser?.email || null,
        },
        salesperson: result.salespersonUser ? {
          id: Number(result.salespersonUser.id),
          name: result.salespersonUser.name,
          divisionId: result.divisionValidation?.salespersonDivisionId ?? null,
          divisionName: result.divisionValidation?.salespersonDivisionName ?? null,
        } : null,
        itemIds: result.divisionValidation?.itemIds || [],
        itemDivisionIds: result.divisionValidation?.itemDivisionIds || [],
        itemDivisionNames: result.divisionValidation?.itemDivisionNames || [],
      },
      userId: appUser?.id || null,
    });

    await recordDivisionValidationTimeline({
      appUser,
      entityId: id,
      shipmentNumber: result.shipment?.shipment_number || null,
      outcome: 'passed',
      salespersonUser: result.salespersonUser,
      validation: result.divisionValidation,
    });

    return NextResponse.json(result);
  } catch (error) {
    await recordDivisionValidationTimeline({
      appUser,
      entityId: shipmentIdForLogging,
      outcome: 'failed',
      reasonCode: error?.reasonCode || null,
    });
    console.error('Failed to update outbound shipment:', error);
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return NextResponse.json(
      { error: status === 500 ? 'Failed to update shipment' : error.message, code: error?.reasonCode || undefined, detail: error.message },
      { status }
    );
  }
}
