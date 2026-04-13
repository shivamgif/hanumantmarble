import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole, queueNotification, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

async function applyShipmentApproval(shipmentId, session, appUser) {
  const shipmentRows = await sql(
    `SELECT * FROM stock_inbound_shipments WHERE id = $1 LIMIT 1`,
    [shipmentId]
  );

  const shipment = shipmentRows[0];
  if (!shipment) {
    throw new Error('Shipment not found');
  }

  if (shipment.approval_status === 'approved') {
    return shipment;
  }

  await sql('BEGIN', []);

  try {
    const itemRows = await sql(
      `SELECT isi.*, i.sku, i.current_whole_qty, i.current_broken_qty
       FROM stock_inbound_shipment_items isi
       JOIN stock_items i ON i.id = isi.item_id
       WHERE isi.inbound_shipment_id = $1`,
      [shipmentId]
    );

    for (const item of itemRows) {
      if (item.received_whole_qty > 0) {
        await sql(
          `UPDATE stock_items
           SET current_whole_qty = current_whole_qty + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [item.received_whole_qty, item.item_id]
        );

        await sql(
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
        );

        await sql(
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
        );
      }

      if (item.received_broken_qty > 0) {
        await sql(
          `UPDATE stock_items
           SET current_broken_qty = current_broken_qty + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [item.received_broken_qty, item.item_id]
        );

        await sql(
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
        );

        await sql(
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
        );
      }
    }

    const updatedRows = await sql(
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

    await sql('COMMIT', []);

    await recordTimelineEvent({
      eventType: 'inbound_approved',
      entityType: 'inbound_shipment',
      entityId: shipmentId,
      summary: `Inbound shipment ${shipment.shipment_number} approved and added to inventory`,
      details: { shipmentId },
      userId: appUser?.id || null,
    });

    await queueNotification({
      channel: 'whatsapp',
      eventType: 'inbound_received',
      messageText: `Stock arrival approved: ${shipment.shipment_number} is now in inventory.`,
      recipients: [],
      sourceTable: 'stock_inbound_shipments',
      sourceId: shipmentId,
      createdBy: session.user.email,
    });

    return updatedRows[0];
  } catch (error) {
    await sql('ROLLBACK', []);
    throw error;
  }
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
      `SELECT isi.*, i.name, i.sku
       FROM stock_inbound_shipment_items isi
       JOIN stock_items i ON i.id = isi.item_id
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
      const shipment = await applyShipmentApproval(id, session, appUser);
      return NextResponse.json({ shipment });
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
       SET truck_license_plate = COALESCE($1, truck_license_plate),
           truck_number = COALESCE($2, truck_number),
           driver_name = COALESCE($3, driver_name),
           driver_phone = COALESCE($4, driver_phone),
           notes = COALESCE($5, notes),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [body.truckLicensePlate || null, body.truckNumber || null, body.driverName || null, body.driverPhone || null, body.notes || null, id]
    );

    return NextResponse.json({ shipment: rows[0] });
  } catch (error) {
    console.error('Failed to update inbound shipment:', error);
    return NextResponse.json({ error: 'Failed to update shipment', detail: error.message }, { status: 500 });
  }
}
