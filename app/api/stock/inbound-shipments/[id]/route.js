import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole, queueNotification, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql, withTransaction } from '@/lib/db';

async function applyShipmentApproval(shipmentId, session, appUser, idempotencyKey) {
  return withTransaction(async (tx) => {
    // Serialize approval for the same shipment to avoid concurrent double increments.
    await tx(
      `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
      [`stock_inbound_approval:${shipmentId}`]
    );

    const shipmentRows = await tx(
      `SELECT *
       FROM stock_inbound_shipments
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [shipmentId]
    );

    const shipment = shipmentRows[0] || null;
    if (!shipment) {
      throw new Error('Shipment not found');
    }

    const itemRows = await tx(
      `SELECT isi.*, i.sku, i.name AS item_name, b.name AS brand_name, i.current_whole_qty, i.current_broken_qty,
              COALESCE(d.name, 'General') AS department
       FROM stock_inbound_shipment_items isi
       JOIN stock_items i ON i.id = isi.item_id
       LEFT JOIN stock_brands b ON b.id = i.brand_id
       LEFT JOIN stock_divisions d ON d.id = i.division_id
       WHERE isi.inbound_shipment_id = $1
       FOR UPDATE OF i`,
      [shipmentId]
    );

    if (shipment.approval_status === 'approved') {
      return { shipment, items: itemRows, idempotent: true, idempotencyKey };
    }

    const batchPromises = [];

    for (const item of itemRows) {
      if (item.received_whole_qty > 0) {
        batchPromises.push(tx(
          `UPDATE stock_items
           SET current_whole_qty = current_whole_qty + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [item.received_whole_qty, item.item_id]
        ));

        batchPromises.push(tx(
          `INSERT INTO stock_inventory_lots (
            lot_number,
            item_id,
            location_id,
            source_type,
            source_table,
            source_id,
            tile_condition,
            quantity_received,
            quantity_available,
            quantity_reserved,
            unit_cost,
            landed_cost,
            received_at,
            qc_status,
            notes,
            created_by
          ) VALUES ($1,$2,$3,'purchase','stock_inbound_shipments',$4,'whole',$5,$5,0,$6,$7,NOW(),'passed',$8,$9)`,
          [
            `LOT-${shipment.shipment_number}-${item.item_id}-W`,
            item.item_id,
            null,
            shipment.id,
            item.received_whole_qty,
            item.unit_cost,
            item.landed_cost,
            `Approved from shipment ${shipment.shipment_number}`,
            session.user.email,
          ]
        ));

        batchPromises.push(tx(
          `INSERT INTO stock_movements (
            movement_number,
            movement_type,
            direction,
            item_id,
            inventory_lot_id,
            quantity,
            tile_condition,
            unit_cost,
            labour_cost,
            transport_cost,
            source_type,
            source_id,
            reference_number,
            notes,
            created_by
          ) VALUES ($1,'purchase_receive','in',$2,NULL,$3,'whole',$4,$5,$6,'inbound_shipment',$7,$8,$9,$10)`,
          [
            `MOV-${shipment.shipment_number}-${item.item_id}-W`,
            item.item_id,
            item.received_whole_qty,
            item.unit_cost,
            shipment.unloading_labour_cost || 0,
            shipment.delivery_cost || 0,
            shipment.id,
            shipment.invoice_number || shipment.shipment_number,
            `Inbound whole tiles approved for shipment ${shipment.shipment_number}`,
            session.user.email,
          ]
        ));
      }

      if (item.received_broken_qty > 0) {
        batchPromises.push(tx(
          `UPDATE stock_items
           SET current_broken_qty = current_broken_qty + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [item.received_broken_qty, item.item_id]
        ));

        batchPromises.push(tx(
          `INSERT INTO stock_inventory_lots (
            lot_number,
            item_id,
            location_id,
            source_type,
            source_table,
            source_id,
            tile_condition,
            quantity_received,
            quantity_available,
            quantity_reserved,
            unit_cost,
            landed_cost,
            received_at,
            qc_status,
            notes,
            created_by
          ) VALUES ($1,$2,$3,'purchase','stock_inbound_shipments',$4,'broken',$5,$5,0,$6,$7,NOW(),'passed',$8,$9)`,
          [
            `LOT-${shipment.shipment_number}-${item.item_id}-B`,
            item.item_id,
            null,
            shipment.id,
            item.received_broken_qty,
            item.unit_cost,
            item.landed_cost,
            `Broken tiles approved from shipment ${shipment.shipment_number}`,
            session.user.email,
          ]
        ));

        batchPromises.push(tx(
          `INSERT INTO stock_movements (
            movement_number,
            movement_type,
            direction,
            item_id,
            inventory_lot_id,
            quantity,
            tile_condition,
            unit_cost,
            labour_cost,
            transport_cost,
            source_type,
            source_id,
            reference_number,
            notes,
            created_by
          ) VALUES ($1,'purchase_receive','in',$2,NULL,$3,'broken',$4,$5,$6,'inbound_shipment',$7,$8,$9,$10)`,
          [
            `MOV-${shipment.shipment_number}-${item.item_id}-B`,
            item.item_id,
            item.received_broken_qty,
            item.unit_cost,
            shipment.unloading_labour_cost || 0,
            shipment.delivery_cost || 0,
            shipment.id,
            shipment.invoice_number || shipment.shipment_number,
            `Inbound broken tiles approved for shipment ${shipment.shipment_number}`,
            session.user.email,
          ]
        ));
      }
    }

    // Execute all updates simultaneously on the same dedicated client connection
    await Promise.all(batchPromises);

    const updatedRows = await tx(
      `UPDATE stock_inbound_shipments
       SET approval_status = 'approved',
           status = 'received',
           approved_at = NOW(),
           approved_by_user_id = $1,
           reviewed_at = COALESCE(reviewed_at, NOW()),
           reviewed_by_user_id = COALESCE(reviewed_by_user_id, $1),
           received_date = NOW(),
           received_by = COALESCE(received_by, $2),
           locked_at = NOW(),
           locked_by_user_id = $1,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [appUser?.id || null, session.user.email, shipmentId]
    );

    const departments = [...new Set(
      itemRows
        .filter((item) => Number(item.received_whole_qty || 0) > 0 || Number(item.received_broken_qty || 0) > 0)
        .map((item) => String(item.department || 'General').trim() || 'General')
    )];

    const salespersonRecipients = departments.length > 0
      ? await tx(
          `SELECT u.id, u.name, u.email, u.phone,
                  COALESCE(d.name, NULLIF(TRIM(u.department), ''), 'General') AS department
           FROM stock_app_users
           u LEFT JOIN stock_divisions d ON d.id = u.division_id
           WHERE u.status = 'active'
             AND u.role = 'salesperson'
             AND COALESCE(d.name, NULLIF(TRIM(u.department), ''), 'General') = ANY($1::text[])
           ORDER BY u.id ASC`,
          [departments]
        )
      : [];

    return {
      shipment: updatedRows[0],
      items: itemRows,
      idempotent: false,
      idempotencyKey,
      departments,
      salespersonRecipients,
    };
  });
}

export async function GET(request, context) {
  const { session } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const rows = await sql(
      `SELECT * FROM stock_inbound_shipments WHERE id = $1 LIMIT 1`,
      [id]
    );

    const items = await sql(
      `SELECT isi.*, i.name, i.sku,
              COALESCE(d.name, 'General') AS division_name,
              COALESCE(d.name, 'General') AS department
       FROM stock_inbound_shipment_items isi
       JOIN stock_items i ON i.id = isi.item_id
       LEFT JOIN stock_divisions d ON d.id = i.division_id
       WHERE isi.inbound_shipment_id = $1`,
      [id]
    );

    return NextResponse.json({ shipment: rows[0] || null, items });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load shipment', detail: error.message }, { status: 500 });
  }
}

export async function PATCH(request, context) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const action = body.action || 'update';

    if (action === 'approve') {
      const requestIdempotencyKey = String(
        body?.idempotencyKey || request.headers.get('x-idempotency-key') || `inbound-shipment-${id}`
      ).trim();

      const result = await applyShipmentApproval(id, session, appUser, requestIdempotencyKey);
      const warnings = [];

      try {
        await recordTimelineEvent({
          eventType: 'inbound_approved',
          entityType: 'inbound_shipment',
          entityId: id,
          summary: `Inbound shipment ${result.shipment.shipment_number} approved and added to inventory`,
          details: { shipmentId: id },
          userId: appUser?.id || null,
        });
      } catch (timelineError) {
        console.error('Failed to record inbound approval timeline event:', timelineError);
        warnings.push('Timeline entry could not be saved.');
      }

      try {
        if (!result.idempotent) {
          const recipientsByDepartment = Array.isArray(result.salespersonRecipients)
            ? result.salespersonRecipients
            : [];

          const receivedItems = (Array.isArray(result.items) ? result.items : []).filter(
            (item) => Number(item.received_whole_qty || 0) > 0 || Number(item.received_broken_qty || 0) > 0
          );
          const primaryItem = receivedItems[0] || null;
          const totalReceived = receivedItems.reduce(
            (sum, item) => sum + Number(item.received_whole_qty || 0) + Number(item.received_broken_qty || 0),
            0
          );

          for (const recipient of recipientsByDepartment) {
            const department = String(recipient.department || 'General').trim() || 'General';
            const messageText = `Stock purchase approved: ${result.shipment.shipment_number}. New ${department} inventory is available.`;

            await queueNotification({
              channel: 'whatsapp',
              eventType: 'inbound_received',
              messageText,
              recipients: [
                {
                  kind: 'salesperson',
                  userId: recipient.id,
                  name: recipient.name,
                  email: recipient.email,
                  phone: recipient.phone,
                  department,
                  whatsappPayload: {
                    to: recipient.phone || recipient.email,
                    template: 'stock_department_arrival',
                    variables: {
                      shipmentNumber: result.shipment.shipment_number,
                      department,
                      brandName: primaryItem?.brand_name || 'Generic',
                      itemName: primaryItem?.item_name || 'Stock',
                      totalQty: String(totalReceived),
                    },
                  },
                },
              ],
              sourceTable: 'stock_inbound_shipments',
              sourceId: id,
              createdBy: session.user.email,
            });
          }
        }
      } catch (notificationError) {
        console.error('Failed to queue inbound approval notification:', notificationError);
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
        `UPDATE stock_inbound_shipments
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
        entityType: 'inbound_shipment',
        entityId: id,
        summary: `Inbound shipment rejected`,
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
        ) VALUES ($1,'inbound_shipment',$2,'correct',$3,$4,$5,$6,$7,$8,TRUE)
        RETURNING *`,
        [
          generateReference('CHR'),
          id,
          JSON.stringify(body.requestedChanges || {}),
          JSON.stringify(body.originalSnapshot || {}),
          body.reason || 'Requested arrival correction',
          appUser?.id || null,
          appUser?.name || session.user.name || session.user.email,
          body.priority || 'normal',
        ]
      );

      const rows = await sql(
        `UPDATE stock_inbound_shipments
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
        entityType: 'inbound_shipment',
        entityId: id,
        summary: `Change requested for inbound shipment`,
        details: { requestId: changeRequestRows[0].id },
        userId: appUser?.id || null,
      });

      return NextResponse.json({ shipment: rows[0], changeRequest: changeRequestRows[0] });
    }

    const rows = await sql(
      `UPDATE stock_inbound_shipments
       SET truck_license_plate_snapshot = COALESCE($1, truck_license_plate_snapshot),
           truck_number_snapshot = COALESCE($2, truck_number_snapshot),
           driver_name_snapshot = COALESCE($3, driver_name_snapshot),
           driver_phone_snapshot = COALESCE($4, driver_phone_snapshot),
           notes = COALESCE($5, notes),
           customer_id = COALESCE($7::bigint, customer_id),
           salesperson_id = COALESCE($8::bigint, salesperson_id),
           destination_location_id = COALESCE($9::bigint, destination_location_id),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        body.truckLicensePlate || null,
        body.truckNumber || null,
        body.driverName || null,
        body.driverPhone || null,
        body.notes || null,
        id,
        body.customerId ? Number(body.customerId) : null,           // $7
        body.salespersonId ? Number(body.salespersonId) : null,     // $8
        body.destinationLocationId ? Number(body.destinationLocationId) : null, // $9
      ]
    );

    return NextResponse.json({ shipment: rows[0] });
  } catch (error) {
    console.error('Failed to update inbound shipment:', error);
    return NextResponse.json({ error: 'Failed to update shipment', detail: error.message }, { status: 500 });
  }
}
