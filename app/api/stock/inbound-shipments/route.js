import { NextResponse } from 'next/server';
import {
  collectNotificationRecipients,
  ensureDatabaseAvailable,
  generateReference,
  getStockContext,
  hasAnyStockRole,
  normalizeText,
  queueNotification,
  recordTimelineEvent,
  upsertNamedRecord,
} from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

function generateSku({ brandName, typeName, sizeLabel, itemName }) {
  const parts = [brandName, typeName, sizeLabel, itemName]
    .map((value) => normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-'))
    .filter(Boolean);

  return parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '') || generateReference('TILE');
}

async function resolveExistingItem(item) {
  if (item.itemId) {
    const rows = await sql(
      `SELECT *
       FROM stock_items
       WHERE id = $1
       LIMIT 1`,
      [item.itemId]
    );

    if (rows[0]) {
      return rows[0];
    }
  }

  const sku = normalizeText(item.sku);
  if (sku) {
    const rows = await sql(
      `SELECT *
       FROM stock_items
       WHERE sku = $1
       LIMIT 1`,
      [sku]
    );

    if (rows[0]) {
      return rows[0];
    }
  }

  return null;
}

async function upsertItemMaster(item) {
  const existingItem = await resolveExistingItem(item);
  if (existingItem) {
    return existingItem;
  }

  const brand = await upsertNamedRecord({ table: 'stock_brands', value: item.brandName, extra: { name_hi: item.brandNameHi || null } });
  const type = await upsertNamedRecord({ table: 'stock_types', value: item.typeName, extra: { name_hi: item.typeNameHi || null } });
  const size = await upsertNamedRecord({
    table: 'stock_sizes',
    column: 'label',
    value: item.sizeLabel,
    extra: {
      width_mm: item.widthMm || null,
      length_mm: item.lengthMm || null,
      thickness_mm: item.thicknessMm || null,
      unit: item.sizeUnit || 'mm',
    },
  });

  const sku = normalizeText(item.sku) || generateSku({ brandName: brand.name, typeName: type.name, sizeLabel: size.label, itemName: item.itemName });
  const rows = await sql(
    `INSERT INTO stock_items (
      sku,
      brand_id,
      type_id,
      size_id,
      name,
      name_hi,
      unit_of_measure,
      tiles_per_box,
      pieces_per_box,
      reorder_level,
      safety_stock,
      purchase_price,
      landed_cost,
      selling_price,
      description,
      description_hi
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (sku) DO UPDATE SET
      brand_id = EXCLUDED.brand_id,
      type_id = EXCLUDED.type_id,
      size_id = EXCLUDED.size_id,
      name = EXCLUDED.name,
      name_hi = EXCLUDED.name_hi,
      unit_of_measure = EXCLUDED.unit_of_measure,
      tiles_per_box = EXCLUDED.tiles_per_box,
      pieces_per_box = EXCLUDED.pieces_per_box,
      reorder_level = EXCLUDED.reorder_level,
      safety_stock = EXCLUDED.safety_stock,
      purchase_price = EXCLUDED.purchase_price,
      landed_cost = EXCLUDED.landed_cost,
      selling_price = EXCLUDED.selling_price,
      description = EXCLUDED.description,
      description_hi = EXCLUDED.description_hi,
      updated_at = NOW()
    RETURNING *`,
    [
      sku,
      brand.id,
      type.id,
      size.id,
      normalizeText(item.itemName),
      item.itemNameHi || null,
      item.unitOfMeasure || 'box',
      item.tilesPerBox || null,
      item.piecesPerBox || null,
      item.reorderLevel || 10,
      item.safetyStock || 0,
      item.purchasePrice || null,
      item.landedCost || null,
      item.sellingPrice || null,
      item.description || null,
      item.descriptionHi || null,
    ]
  );

  return rows[0];
}

export async function GET(request) {
  const { session } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ shipments: [], message: 'Database not configured yet.' }, { status: 503 });
  }

  try {
    const shipments = await sql(
      `SELECT *
       FROM stock_inbound_shipments
       ORDER BY created_at DESC
       LIMIT 50`,
      []
    );

    return NextResponse.json({ shipments });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch arrivals', detail: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ error: 'At least one item row is required' }, { status: 400 });
    }

    const supplier = body.supplierName ? await upsertNamedRecord({ table: 'stock_suppliers', value: body.supplierName, extra: { phone: body.supplierPhone || null, email: body.supplierEmail || null, address: body.supplierAddress || null, notes: body.supplierNotes || null } }) : null;
    const transporter = body.transporterName ? await upsertNamedRecord({ table: 'stock_transporters', value: body.transporterName, extra: { phone: body.transporterPhone || null, vehicle_number: body.transporterVehicleNumber || null, address: body.transporterAddress || null, notes: body.transporterNotes || null } }) : null;
    const vehicle = body.vehicleNumber ? await sql(
      `INSERT INTO stock_vehicles (vehicle_number, vehicle_type, driver_name, driver_phone, transporter_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (vehicle_number) DO UPDATE SET
         vehicle_type = EXCLUDED.vehicle_type,
         driver_name = EXCLUDED.driver_name,
         driver_phone = EXCLUDED.driver_phone,
         transporter_id = EXCLUDED.transporter_id,
         updated_at = NOW()
       RETURNING *`,
      [body.vehicleNumber, body.vehicleType || null, body.driverName || null, body.driverPhone || null, transporter?.id || null]
    ) : [];

    const shipmentNumber = normalizeText(body.shipmentNumber) || generateReference('INB');

    const shipmentRows = await sql(
      `INSERT INTO stock_inbound_shipments (
        shipment_number,
        purchase_order_id,
        supplier_id,
        transporter_id,
        vehicle_id,
        truck_license_plate,
        truck_number,
        driver_name,
        driver_phone,
        arrival_date,
        submitted_at,
        submitted_by_user_id,
        approval_status,
        status,
        invoice_number,
        transporter_bill_number,
        transporter_bill_amount,
        delivery_cost,
        unloading_labour_cost,
        total_whole_qty,
        total_broken_qty,
        received_by,
        recorded_by_user_id,
        notes,
        created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        COALESCE($10, NOW()),
        NOW(),
        $11,
        'pending',
        'submitted',
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21,
        $22
      )
      RETURNING *`,
      [
        shipmentNumber,
        body.purchaseOrderId || null,
        supplier?.id || body.supplierId || null,
        transporter?.id || body.transporterId || null,
        vehicle[0]?.id || body.vehicleId || null,
        normalizeText(body.truckLicensePlate) || null,
        normalizeText(body.truckNumber) || null,
        normalizeText(body.driverName) || null,
        normalizeText(body.driverPhone) || null,
        body.arrivalDate || null,
        appUser?.id || null,
        normalizeText(body.invoiceNumber) || null,
        normalizeText(body.transporterBillNumber) || null,
        body.transporterBillAmount || 0,
        body.deliveryCost || 0,
        body.unloadingLabourCost || 0,
        items.reduce((total, item) => total + Number(item.wholeQty || 0), 0),
        items.reduce((total, item) => total + Number(item.brokenQty || 0), 0),
        normalizeText(body.receivedBy) || session.user.name || session.user.email,
        appUser?.id || null,
        body.notes || null,
        session.user.email,
      ]
    );

    const shipment = shipmentRows[0];

    for (const row of items) {
      const item = await upsertItemMaster(row);

      await sql(
        `INSERT INTO stock_inbound_shipment_items (
          inbound_shipment_id,
          item_id,
          ordered_qty,
          received_whole_qty,
          received_broken_qty,
          rejected_qty,
          unit_cost,
          landed_cost,
          notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          shipment.id,
          item.id,
          Number(row.orderedQty || row.wholeQty || 0) + Number(row.brokenQty || 0),
          Number(row.wholeQty || 0),
          Number(row.brokenQty || 0),
          Number(row.rejectedQty || 0),
          Number(row.unitPrice || 0),
          Number(row.landedCost || row.unitPrice || 0),
          row.notes || null,
        ]
      );
    }

    const recipients = await collectNotificationRecipients();
    await queueNotification({
      channel: 'whatsapp',
      eventType: 'inbound_arrival',
      messageText: `New stock arrival submitted: ${shipment.shipment_number}. Review and approve to add to inventory.`,
      recipients,
      sourceTable: 'stock_inbound_shipments',
      sourceId: shipment.id,
      createdBy: session.user.email,
    });

    await recordTimelineEvent({
      eventType: 'inbound_submitted',
      entityType: 'inbound_shipment',
      entityId: shipment.id,
      summary: `Inbound shipment ${shipment.shipment_number} submitted for review`,
      details: { shipmentNumber: shipment.shipment_number, truckLicensePlate: body.truckLicensePlate || null },
      userId: appUser?.id || null,
    });

    return NextResponse.json({ shipment }, { status: 201 });
  } catch (error) {
    console.error('Failed to create inbound shipment:', error);
    return NextResponse.json({ error: 'Failed to submit arrival', detail: error.message }, { status: 500 });
  }
}
