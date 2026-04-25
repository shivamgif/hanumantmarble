import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, generateReference, getStockContext, hasAnyStockRole, queueNotification, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql, withTransaction } from '@/lib/db';

async function loadShipmentWithItems(id) {
  const shipmentRows = await sql(
    `SELECT sos.*,
            sos.truck_license_plate_snapshot AS truck_license_plate,
            sos.driver_name_snapshot AS driver_name,
            c.name AS customer_name,
            c.phone AS customer_phone_number,
            sp.name AS salesperson_name,
            COALESCE(agg.total_whole_qty, 0) AS total_whole_qty,
            COALESCE(agg.total_broken_qty, 0) AS total_broken_qty,
            COALESCE(agg.total_return_whole_qty, 0) AS total_return_whole_qty,
            COALESCE(agg.total_return_broken_qty, 0) AS total_return_broken_qty,
            COALESCE(agg.total_selling_price_excl, 0) AS total_selling_price_excl
     FROM stock_outbound_shipments sos
     LEFT JOIN stock_customers c ON c.id = sos.customer_id
     LEFT JOIN stock_sales_people sp ON sp.id = sos.salesperson_id
     LEFT JOIN (
       SELECT outbound_shipment_id,
              SUM(loaded_whole_qty) AS total_whole_qty,
              SUM(loaded_broken_qty) AS total_broken_qty,
              SUM(returned_whole_qty) AS total_return_whole_qty,
              SUM(returned_broken_qty) AS total_return_broken_qty,
              COALESCE(SUM(loaded_whole_qty * rate_per_unit), 0) AS total_selling_price_excl
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
            i.current_whole_qty, i.current_broken_qty
     FROM stock_outbound_shipment_items soi
     JOIN stock_items i ON i.id = soi.item_id
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
              i.current_whole_qty, i.current_broken_qty
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
        if (Number(item.current_whole_qty || 0) < wholeToIssue) {
          throw new Error(`Insufficient whole stock for ${item.sku}`);
        }

        // Run the update synchronously first to ensure we get the RETURNING id
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

  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ensureDatabaseAvailable())) return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  if (!hasAnyStockRole(appUser, ['admin', 'manager'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
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

    const result = await withTransaction(async (tx) => {
      // Mutability guard: approved outbound shipments have already deducted stock.
      // Editing them without a full reversal pass would silently miscount inventory.
      const existingRows = await tx(
        `SELECT approval_status, locked_at FROM stock_outbound_shipments WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const existing = existingRows[0];
      if (!existing) {
        throw new Error('Shipment not found');
      }
      if (existing.approval_status === 'approved' || existing.locked_at) {
        const err = new Error('Cannot modify an approved or locked outbound shipment');
        err.statusCode = 409;
        throw err;
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
            `SELECT sku, current_whole_qty, current_broken_qty FROM stock_items WHERE id = $1`,
            [item.itemId]
          );
          const stock = stockRows[0];
          if (!stock) {
            throw new Error(`Item ${item.itemId} not found`);
          }
          if (wholeReq > Number(stock.current_whole_qty || 0)) {
            const err = new Error(`Requested whole qty ${wholeReq} exceeds available ${stock.current_whole_qty} for ${stock.sku}`);
            err.statusCode = 400;
            throw err;
          }
          if (brokenReq > Number(stock.current_broken_qty || 0)) {
            const err = new Error(`Requested broken qty ${brokenReq} exceeds available ${stock.current_broken_qty} for ${stock.sku}`);
            err.statusCode = 400;
            throw err;
          }
        }
      }

      // Resolve IDs from names if provided
      let resolvedCustomerId = null;
      let resolvedSalespersonId = null;

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

      if (body.salespersonName) {
        const sRows = await tx('SELECT id FROM stock_sales_people WHERE lower(name) = lower($1) LIMIT 1', [body.salespersonName.trim()]);
        resolvedSalespersonId = sRows[0]?.id || null;
      }

      const shipmentRows = await tx(
        `UPDATE stock_outbound_shipments
         SET shipment_number = COALESCE($1, shipment_number),
             customer_id = COALESCE($2, customer_id),
             truck_license_plate_snapshot = COALESCE($3, truck_license_plate_snapshot),
             truck_number_snapshot = COALESCE($4, truck_number_snapshot),
             driver_name_snapshot = COALESCE($5, driver_name_snapshot),
             invoice_number = COALESCE($6, invoice_number),
             dispatch_date = COALESCE($7, dispatch_date),
             transport_cost = COALESCE($8, transport_cost),
             loading_labour_cost = COALESCE($9, loading_labour_cost),
             notes = COALESCE($10, notes),
             salesperson_id = COALESCE($11, salesperson_id),
             payment_status = COALESCE($12, payment_status),
             updated_at = NOW()
         WHERE id = $13
         RETURNING *`,
        [
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
          body.paymentStatus || null,
          id,
        ]
      );

      if (body.items && Array.isArray(body.items)) {
        // Delete existing items
        await tx(`DELETE FROM stock_outbound_shipment_items WHERE outbound_shipment_id = $1`, [id]);

        // Insert new items
        for (const item of body.items) {
          await tx(
            `INSERT INTO stock_outbound_shipment_items (
              outbound_shipment_id, item_id, loaded_whole_qty, loaded_broken_qty,
              returned_whole_qty, returned_broken_qty, sell_unit, rate_per_unit, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              id,
              item.itemId,
              item.loadedWholeQty || 0,
              item.loadedBrokenQty || 0,
              item.returnWholeQty || 0,
              item.returnBrokenQty || 0,
              item.sellUnit || 'box',
              item.ratePerUnit != null && item.ratePerUnit !== '' ? Number(item.ratePerUnit) : null,
              item.notes || null,
            ]
          );
        }
      }

      return { shipment: shipmentRows[0] };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to update outbound shipment:', error);
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return NextResponse.json({ error: 'Failed to update shipment', detail: error.message }, { status });
  }
}
