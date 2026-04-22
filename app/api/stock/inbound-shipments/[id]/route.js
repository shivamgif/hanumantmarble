import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, generateReference, getStockContext, hasAnyStockRole, queueNotification, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql, withTransaction } from '@/lib/db';

function computeSqmValues(item, size) {
  const widthMm = size?.width_mm;
  const lengthMm = size?.length_mm;
  const piecesPerBox = item.piecesPerBox;

  if (!widthMm || !lengthMm) {
    return { sqmPerBox: null, sqmPerTile: null };
  }

  const sqmPerTile = (widthMm * lengthMm) / 1_000_000;
  const sqmPerBox = piecesPerBox ? sqmPerTile * piecesPerBox : null;

  return { sqmPerBox, sqmPerTile };
}

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
      `SELECT s.*,
              s.truck_license_plate_snapshot AS truck_license_plate,
              s.truck_number_snapshot AS truck_number,
              s.driver_name_snapshot AS driver_name,
              s.driver_phone_snapshot AS driver_phone,
              sup.name AS supplier_name,
              sup.gst_number AS supplier_gst_number,
              sup.address AS supplier_address,
              sup.phone AS supplier_phone,
              sup.email AS supplier_email,
              tr.name AS transporter_name,
              tr.phone AS transporter_phone,
              loc.name AS destination_warehouse_name
       FROM stock_inbound_shipments s
       LEFT JOIN stock_suppliers sup ON sup.id = s.supplier_id
       LEFT JOIN stock_transporters tr ON tr.id = s.transporter_id
       LEFT JOIN stock_locations loc ON loc.id = s.destination_location_id
       WHERE s.id = $1 LIMIT 1`,
      [id]
    );

    const items = await sql(
      `WITH size_parsed AS (
         SELECT id,
                label,
                unit,
                width_mm,
                length_mm,
                COALESCE(width_mm, NULLIF((regexp_match(label, '(\\d+(?:\\.\\d+)?)\\s*[x×*]\\s*(\\d+(?:\\.\\d+)?)', 'i'))[1], '')::numeric) AS w_mm,
                COALESCE(length_mm, NULLIF((regexp_match(label, '(\\d+(?:\\.\\d+)?)\\s*[x×*]\\s*(\\d+(?:\\.\\d+)?)', 'i'))[2], '')::numeric) AS l_mm
           FROM stock_sizes
       )
       SELECT isi.*,
              i.name AS item_name,
              i.name,
              i.sku,
              i.finish,
              i.grade,
              i.thickness_mm,
              i.pieces_per_box,
              b.name AS brand_name,
              sz.label AS size_label,
              sz.unit AS size_unit,
              COALESCE(d.name, 'General') AS division_name,
              COALESCE(d.name, 'General') AS department,
              isi.total_cost,
              COALESCE(
                isi.ordered_qty_sqm,
                CASE WHEN sz.w_mm IS NOT NULL AND sz.l_mm IS NOT NULL AND i.pieces_per_box IS NOT NULL
                  THEN ROUND(((sz.w_mm * sz.l_mm) / 1000000.0) * i.pieces_per_box * COALESCE(isi.ordered_qty, 0), 3)
                  ELSE NULL END
              ) AS ordered_qty_sqm,
              COALESCE(
                isi.whole_qty_sqm,
                CASE WHEN sz.w_mm IS NOT NULL AND sz.l_mm IS NOT NULL AND i.pieces_per_box IS NOT NULL
                  THEN ROUND(((sz.w_mm * sz.l_mm) / 1000000.0) * i.pieces_per_box * COALESCE(isi.received_whole_qty, 0), 3)
                  ELSE NULL END
              ) AS whole_qty_sqm,
              COALESCE(
                isi.broken_qty_sqm,
                CASE WHEN sz.w_mm IS NOT NULL AND sz.l_mm IS NOT NULL
                  THEN ROUND(((sz.w_mm * sz.l_mm) / 1000000.0) * COALESCE(isi.received_broken_qty, 0), 3)
                  ELSE NULL END
              ) AS broken_qty_sqm,
              COALESCE(isi.qty_sqm, isi.ordered_qty_sqm, 0) AS qty_sqm
       FROM stock_inbound_shipment_items isi
       JOIN stock_items i ON i.id = isi.item_id
       LEFT JOIN stock_brands b ON b.id = i.brand_id
       LEFT JOIN size_parsed sz ON sz.id = i.size_id
       LEFT JOIN stock_divisions d ON d.id = i.division_id
       WHERE isi.inbound_shipment_id = $1
       ORDER BY isi.id ASC`,
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

    if (action === 'delete') {
      if (body.status !== 'cancelled') {
        return NextResponse.json({ error: 'Can only delete cancelled inbound shipments' }, { status: 400 });
      }

      await sql(
        `DELETE FROM stock_inbound_shipment_items
         WHERE inbound_shipment_id = $1`,
        [id]
      );

      await sql(
        `DELETE FROM stock_documents
         WHERE entity_type = 'inbound_shipment' AND entity_id = $1`,
        [id]
      );

      await sql(
        `DELETE FROM stock_notifications
         WHERE source_table = 'stock_inbound_shipments' AND source_id = $1`,
        [id]
      );

      await sql(
        `DELETE FROM stock_timeline_events
         WHERE entity_type = 'inbound_shipment' AND entity_id = $1`,
        [id]
      );

      const deleteRows = await sql(
        `DELETE FROM stock_inbound_shipments
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      return NextResponse.json({
        message: 'Cancelled inbound shipment deleted successfully',
        shipment: deleteRows[0]
      });
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

    // Full update: resolve supplier/transporter by name, update all fields, replace items
    if (action === 'update') {
      let resolvedSupplierId = null;
      let resolvedTransporterId = null;
      let resolvedLocationId = null;

      if (body.supplierName) {
        const sRows = await sql('SELECT id FROM stock_suppliers WHERE lower(name) = lower($1) LIMIT 1', [body.supplierName.trim()]);
        resolvedSupplierId = sRows[0]?.id || null;
      }
      if (body.transporterName) {
        const tRows = await sql('SELECT id FROM stock_transporters WHERE lower(name) = lower($1) LIMIT 1', [body.transporterName.trim()]);
        resolvedTransporterId = tRows[0]?.id || null;
      }
      if (body.destinationWarehouseName) {
        const lRows = await sql('SELECT id FROM stock_locations WHERE lower(name) = lower($1) LIMIT 1', [body.destinationWarehouseName.trim()]);
        resolvedLocationId = lRows[0]?.id || null;
      }

      const updatedRows = await sql(
        `UPDATE stock_inbound_shipments
         SET shipment_number = COALESCE($1, shipment_number),
             supplier_id = COALESCE($2, supplier_id),
             truck_license_plate_snapshot = COALESCE($3, truck_license_plate_snapshot),
             truck_number_snapshot = COALESCE($3, truck_number_snapshot),
             driver_name_snapshot = COALESCE($4, driver_name_snapshot),
             invoice_number = COALESCE($5, invoice_number),
             invoice_date = COALESCE($6, invoice_date),
             origin_city = COALESCE($7, origin_city),
             destination_location_id = COALESCE($8, destination_location_id),
             transporter_id = COALESCE($9, transporter_id),
             payment_status = COALESCE($10, payment_status),
             paid_amount = COALESCE($11::numeric, paid_amount),
             payment_date = COALESCE($12, payment_date),
             payment_reference = COALESCE($13, payment_reference),
             payment_mode = COALESCE($14, payment_mode),
             delivery_cost = COALESCE($15::numeric, delivery_cost),
             unloading_labour_cost = COALESCE($16::numeric, unloading_labour_cost),
             handling_cost_percent = COALESCE($17::numeric, handling_cost_percent),
             fuel_cost_percent = COALESCE($18::numeric, fuel_cost_percent),
             gst_percent = COALESCE($19::numeric, gst_percent),
             freight_weight_kg = COALESCE($20::numeric, freight_weight_kg),
             notes = COALESCE($21, notes),
             updated_at = NOW()
         WHERE id = $22
         RETURNING *`,
        [
          body.shipmentNumber || null,
          resolvedSupplierId,
          body.truckLicensePlate || null,
          body.driverName || null,
          body.invoiceNumber || null,
          body.invoiceDate || null,
          body.originCity || null,
          resolvedLocationId,
          resolvedTransporterId,
          body.paymentStatus || null,
          body.paidAmount != null && body.paidAmount !== '' ? Number(body.paidAmount) : null,
          body.paymentDate || null,
          body.paymentReference || null,
          body.paymentMode || null,
          (body.deliveryCost ?? body.transportCost) != null && (body.deliveryCost ?? body.transportCost) !== '' ? Number(body.deliveryCost ?? body.transportCost) : null,
          (body.unloadingLabourCost) != null && body.unloadingLabourCost !== '' ? Number(body.unloadingLabourCost) : null,
          body.handlingCostPercent != null ? Number(body.handlingCostPercent) : null,
          body.fuelCostPercent != null ? Number(body.fuelCostPercent) : null,
          body.gstPercent != null ? Number(body.gstPercent) : null,
          body.freightWeightKg != null && body.freightWeightKg !== '' ? Number(body.freightWeightKg) : null,
          body.notes || null,
          id,
        ]
      );

      if (body.items && Array.isArray(body.items)) {
        const approvalCheck = await sql('SELECT approval_status FROM stock_inbound_shipments WHERE id = $1', [id]);
        if (approvalCheck[0]?.approval_status !== 'approved') {
          await sql('DELETE FROM stock_inbound_shipment_items WHERE inbound_shipment_id = $1', [id]);
          for (const item of body.items) {
            if (!item.itemId) continue;
            await sql(
              `INSERT INTO stock_inbound_shipment_items
                 (inbound_shipment_id, item_id, received_whole_qty, received_broken_qty, ordered_qty, cost_per_sqm, hsn_code, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                id,
                Number(item.itemId),
                item.wholeQty || 0,
                item.brokenQty || 0,
                item.orderedBoxes || null,
                item.costPerSqm || null,
                item.hsnCode || null,
                item.notes || null,
              ]
            );
          }
        }
      }

      return NextResponse.json({ shipment: updatedRows[0] });
    }

    // Handle line item updates if provided
    if (body.items && Array.isArray(body.items)) {
      for (const itemUpdate of body.items) {
        if (!itemUpdate.id) continue;

        const itemRow = await sql(
          `SELECT isi.*, i.pieces_per_box
           FROM stock_inbound_shipment_items isi
           JOIN stock_items i ON i.id = isi.item_id
           WHERE isi.id = $1 LIMIT 1`,
          [itemUpdate.id]
        );

        if (itemRow[0]) {
          const item = itemRow[0];
          const size = await sql(
            `SELECT * FROM stock_sizes WHERE id = (SELECT size_id FROM stock_items WHERE id = $1)`,
            [item.item_id]
          );

          const { sqmPerBox, sqmPerTile } = computeSqmValues(
            { piecesPerBox: item.pieces_per_box },
            size[0]
          );

          const newWholeQty = itemUpdate.received_whole_qty != null ? Number(itemUpdate.received_whole_qty) : item.received_whole_qty;
          const newBrokenQty = itemUpdate.received_broken_qty != null ? Number(itemUpdate.received_broken_qty) : item.received_broken_qty;
          const newOrderedBoxes = itemUpdate.ordered_qty != null ? Number(itemUpdate.ordered_qty) : item.ordered_qty;
          const costPerSqm = itemUpdate.cost_per_sqm != null ? Number(itemUpdate.cost_per_sqm) : item.cost_per_sqm;

          const whole_qty_sqm = sqmPerBox != null ? Number((sqmPerBox * newWholeQty).toFixed(3)) : null;
          const broken_qty_sqm = sqmPerTile != null ? Number((sqmPerTile * newBrokenQty).toFixed(3)) : null;
          const ordered_qty_sqm = sqmPerBox != null ? Number((sqmPerBox * newOrderedBoxes).toFixed(3)) : null;
          const total_cost = ordered_qty_sqm != null && costPerSqm
            ? Number((ordered_qty_sqm * costPerSqm).toFixed(2))
            : 0;

          await sql(
            `UPDATE stock_inbound_shipment_items
             SET received_whole_qty = $1,
                 received_broken_qty = $2,
                 ordered_qty = $3,
                 cost_per_sqm = $4,
                 whole_qty_sqm = $5,
                 broken_qty_sqm = $6,
                 ordered_qty_sqm = $7,
                 total_cost = $8,
                 updated_at = NOW()
             WHERE id = $9`,
            [newWholeQty, newBrokenQty, newOrderedBoxes, costPerSqm, whole_qty_sqm, broken_qty_sqm, ordered_qty_sqm, total_cost, itemUpdate.id]
          );
        }
      }

      // Recompute shipment grand_total
      const lineItems = await sql(
        `SELECT total_cost FROM stock_inbound_shipment_items WHERE inbound_shipment_id = $1`,
        [id]
      );
      const subtotal = lineItems.reduce((sum, i) => sum + (i.total_cost || 0), 0);

      const shipmentData = await sql(
        `SELECT handling_cost_percent, fuel_cost_percent, gst_percent FROM stock_inbound_shipments WHERE id = $1`,
        [id]
      );

      if (shipmentData[0]) {
        const handlingPct = shipmentData[0].handling_cost_percent || 1.0;
        const fuelPct = shipmentData[0].fuel_cost_percent || 5.0;
        const gstPct = shipmentData[0].gst_percent || 18.0;
        const grand_total = Number((subtotal + (subtotal * handlingPct / 100) + (subtotal * fuelPct / 100) + (subtotal * gstPct / 100)).toFixed(2));

        await sql(
          `UPDATE stock_inbound_shipments SET grand_total = $1, updated_at = NOW() WHERE id = $2`,
          [grand_total, id]
        );
      }
    }

    const rows = await sql(
      `UPDATE stock_inbound_shipments
       SET truck_license_plate_snapshot = COALESCE($1, truck_license_plate_snapshot),
           truck_number_snapshot = COALESCE($2, truck_number_snapshot),
           driver_name_snapshot = COALESCE($3, driver_name_snapshot),
           driver_phone_snapshot = COALESCE($4, driver_phone_snapshot),
           notes = COALESCE($5, notes),
           handling_cost_percent = COALESCE($7::numeric, handling_cost_percent),
           fuel_cost_percent = COALESCE($8::numeric, fuel_cost_percent),
           gst_percent = COALESCE($9::numeric, gst_percent),
           freight_weight_kg = COALESCE($10::numeric, freight_weight_kg),
           customer_id = COALESCE($11::bigint, customer_id),
           salesperson_id = COALESCE($12::bigint, salesperson_id),
           destination_location_id = COALESCE($13::bigint, destination_location_id),
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
        body.handlingCostPercent != null ? Number(body.handlingCostPercent) : null,
        body.fuelCostPercent != null ? Number(body.fuelCostPercent) : null,
        body.gstPercent != null ? Number(body.gstPercent) : null,
        body.freightWeightKg != null ? Number(body.freightWeightKg) : null,
        body.customerId ? Number(body.customerId) : null,           // $11
        body.salespersonId ? Number(body.salespersonId) : null,     // $12
        body.destinationLocationId ? Number(body.destinationLocationId) : null, // $13
      ]
    );

    return NextResponse.json({ shipment: rows[0] });
  } catch (error) {
    console.error('Failed to update inbound shipment:', error);
    return NextResponse.json({ error: 'Failed to update shipment', detail: error.message }, { status: 500 });
  }
}
