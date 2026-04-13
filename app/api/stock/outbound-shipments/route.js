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
} from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

function toPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function resolveStockItem(item) {
  if (item.itemId) {
    const rows = await sql(
      `SELECT id, sku, name, current_whole_qty, current_broken_qty
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
      `SELECT id, sku, name, current_whole_qty, current_broken_qty
       FROM stock_items
       WHERE sku = $1
       LIMIT 1`,
      [sku]
    );

    if (rows[0]) {
      return rows[0];
    }
  }

  throw new Error('Unable to resolve stock item for outbound shipment row');
}

async function resolveCustomerContext(body) {
  if (body.salesOrderId) {
    const rows = await sql(
      `SELECT so.id, so.customer_id, so.sales_person, so.notes,
              c.name AS customer_name,
              c.phone AS customer_phone,
              c.whatsapp_phone AS customer_whatsapp_phone,
              c.email AS customer_email
       FROM stock_sales_orders so
       LEFT JOIN stock_customers c ON c.id = so.customer_id
       WHERE so.id = $1
       LIMIT 1`,
      [body.salesOrderId]
    );

    if (rows[0]) {
      return rows[0];
    }
  }

  if (body.customerId) {
    const rows = await sql(
      `SELECT id, name AS customer_name, phone AS customer_phone, whatsapp_phone AS customer_whatsapp_phone, email AS customer_email
       FROM stock_customers
       WHERE id = $1
       LIMIT 1`,
      [body.customerId]
    );

    if (rows[0]) {
      return rows[0];
    }
  }

  return null;
}

async function resolveVehicleId(body) {
  if (body.vehicleId) {
    return body.vehicleId;
  }

  const vehicleNumber = normalizeText(body.vehicleNumber || body.truckLicensePlate || body.truckNumber);
  if (!vehicleNumber) {
    return null;
  }

  const rows = await sql(
    `INSERT INTO stock_vehicles (
      vehicle_number,
      vehicle_type,
      driver_name,
      driver_phone
    ) VALUES ($1, $2, $3, $4)
    ON CONFLICT (vehicle_number) DO UPDATE SET
      vehicle_type = COALESCE(EXCLUDED.vehicle_type, stock_vehicles.vehicle_type),
      driver_name = COALESCE(EXCLUDED.driver_name, stock_vehicles.driver_name),
      driver_phone = COALESCE(EXCLUDED.driver_phone, stock_vehicles.driver_phone),
      updated_at = NOW()
    RETURNING id`,
    [
      vehicleNumber,
      normalizeText(body.vehicleType) || null,
      normalizeText(body.driverName) || null,
      normalizeText(body.driverPhone) || null,
    ]
  );

  return rows[0]?.id || null;
}

async function loadOutboundShipments({ approvalStatus = null, status = null, limit = 50 } = {}) {
  const filters = [];
  const values = [];

  if (approvalStatus) {
    values.push(approvalStatus);
    filters.push(`sos.approval_status = $${values.length}`);
  }

  if (status) {
    values.push(status);
    filters.push(`sos.status = $${values.length}`);
  }

  values.push(limit);

  const shipments = await sql(
    `SELECT sos.*
     FROM stock_outbound_shipments sos
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY sos.created_at DESC
     LIMIT $${values.length}`,
    values
  );

  if (shipments.length === 0) {
    return [];
  }

  const shipmentIds = shipments.map((shipment) => shipment.id);
  const items = await sql(
    `SELECT soi.*, i.sku, i.name AS item_name
     FROM stock_outbound_shipment_items soi
     JOIN stock_items i ON i.id = soi.item_id
     WHERE soi.outbound_shipment_id = ANY($1::bigint[])
     ORDER BY soi.created_at ASC`,
    [shipmentIds]
  );

  const itemsByShipmentId = new Map();
  for (const item of items) {
    const key = String(item.outbound_shipment_id);
    if (!itemsByShipmentId.has(key)) {
      itemsByShipmentId.set(key, []);
    }
    itemsByShipmentId.get(key).push(item);
  }

  return shipments.map((shipment) => {
    const shipmentItems = itemsByShipmentId.get(String(shipment.id)) || [];
    return {
      ...shipment,
      items: shipmentItems,
      total_loaded_whole_qty: shipmentItems.reduce((sum, item) => sum + Number(item.loaded_whole_qty || 0), 0),
      total_loaded_broken_qty: shipmentItems.reduce((sum, item) => sum + Number(item.loaded_broken_qty || 0), 0),
      total_returned_whole_qty: shipmentItems.reduce((sum, item) => sum + Number(item.returned_whole_qty || 0), 0),
      total_returned_broken_qty: shipmentItems.reduce((sum, item) => sum + Number(item.returned_broken_qty || 0), 0),
    };
  });
}

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ shipments: [], message: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const approvalStatus = searchParams.get('approvalStatus');
    const status = searchParams.get('status');
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

    const shipments = await loadOutboundShipments({
      approvalStatus: approvalStatus || null,
      status: status || null,
      limit,
    });

    return NextResponse.json({ shipments });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load outbound shipments', detail: error.message }, { status: 500 });
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

    const resolvedCustomer = await resolveCustomerContext(body);
    const vehicleId = await resolveVehicleId(body);

    const customerName = normalizeText(body.customerName || resolvedCustomer?.customer_name);
    const customerPhone = normalizeText(body.customerPhone || resolvedCustomer?.customer_phone);
    const salespersonName = normalizeText(body.salespersonName || body.salesPersonName || resolvedCustomer?.sales_person);
    const salespersonPhone = normalizeText(body.salespersonPhone || body.salesPersonPhone);
    const truckLicensePlate = normalizeText(body.truckLicensePlate || body.vehicleNumber || body.truckNumber);
    const truckNumber = normalizeText(body.truckNumber || body.vehicleNumber);
    const driverName = normalizeText(body.driverName);
    const driverPhone = normalizeText(body.driverPhone);
    const shipmentNumber = normalizeText(body.shipmentNumber) || generateReference('DSP');
    const dispatchDate = body.dispatchDate || body.dispatchAt || null;
    const approvalStatus = 'pending';
    const status = 'submitted';

    if (!customerName) {
      return NextResponse.json({ error: 'customerName is required' }, { status: 400 });
    }

    const resolvedItems = [];
    for (const item of items) {
      const stockItem = await resolveStockItem(item);
      const loadedWholeQty = toPositiveInteger(item.loadedWholeQty ?? item.wholeQty);
      const loadedBrokenQty = toPositiveInteger(item.loadedBrokenQty ?? item.brokenQty);
      const deliveredWholeQty = toPositiveInteger(item.deliveredWholeQty);
      const deliveredBrokenQty = toPositiveInteger(item.deliveredBrokenQty);
      const returnedWholeQty = toPositiveInteger(item.returnedWholeQty);
      const returnedBrokenQty = toPositiveInteger(item.returnedBrokenQty);

      if (loadedWholeQty === 0 && loadedBrokenQty === 0) {
        return NextResponse.json({ error: 'Each outbound item row needs whole or broken quantity' }, { status: 400 });
      }

      resolvedItems.push({
        item: stockItem,
        loadedWholeQty,
        loadedBrokenQty,
        deliveredWholeQty,
        deliveredBrokenQty,
        returnedWholeQty,
        returnedBrokenQty,
        notes: normalizeText(item.notes) || null,
      });
    }

    const shipmentRows = await sql(
      `INSERT INTO stock_outbound_shipments (
        shipment_number,
        sales_order_id,
        vehicle_id,
        customer_name,
        customer_phone,
        salesperson_name,
        salesperson_phone,
        truck_license_plate,
        truck_number,
        driver_name,
        driver_phone,
        gatepass_number,
        invoice_number,
        submitted_at,
        submitted_by_user_id,
        approval_status,
        status,
        dispatch_date,
        loading_labour_cost,
        transport_cost,
        return_broken_qty,
        return_notes,
        recorded_by_user_id,
        notes,
        created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
        NOW(),
        $14,
        $15,
        $16,
        COALESCE($17, NOW()),
        $18,
        $19,
        $20,
        $21,
        $22,
        $23,
        $24
      )
      RETURNING *`,
      [
        shipmentNumber,
        body.salesOrderId || null,
        vehicleId,
        customerName,
        customerPhone || null,
        salespersonName || null,
        salespersonPhone || null,
        truckLicensePlate || null,
        truckNumber || null,
        driverName || null,
        driverPhone || null,
        normalizeText(body.gatepassNumber) || null,
        normalizeText(body.invoiceNumber) || null,
        appUser?.id || null,
        approvalStatus,
        status,
        dispatchDate,
        Number(body.loadingLabourCost || 0),
        Number(body.transportCost || 0),
        toPositiveInteger(body.returnBrokenQty),
        normalizeText(body.returnNotes) || null,
        appUser?.id || null,
        normalizeText(body.notes) || null,
        session.user.email,
      ]
    );

    const shipment = shipmentRows[0];

    for (const row of resolvedItems) {
      await sql(
        `INSERT INTO stock_outbound_shipment_items (
          outbound_shipment_id,
          item_id,
          loaded_whole_qty,
          loaded_broken_qty,
          delivered_whole_qty,
          delivered_broken_qty,
          returned_whole_qty,
          returned_broken_qty,
          notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          shipment.id,
          row.item.id,
          row.loadedWholeQty,
          row.loadedBrokenQty,
          row.deliveredWholeQty,
          row.deliveredBrokenQty,
          row.returnedWholeQty,
          row.returnedBrokenQty,
          row.notes,
        ]
      );
    }

    const recipients = await collectNotificationRecipients();
    await queueNotification({
      channel: 'whatsapp',
      eventType: 'outbound_dispatch',
      messageText: `New stock dispatch submitted: ${shipment.shipment_number}. Review and approve before issue.`,
      recipients,
      sourceTable: 'stock_outbound_shipments',
      sourceId: shipment.id,
      createdBy: session.user.email,
    });

    await recordTimelineEvent({
      eventType: 'outbound_submitted',
      entityType: 'outbound_shipment',
      entityId: shipment.id,
      summary: `Outbound shipment ${shipment.shipment_number} submitted for review`,
      details: {
        shipmentNumber: shipment.shipment_number,
        customerName,
        truckLicensePlate: truckLicensePlate || null,
      },
      userId: appUser?.id || null,
    });

    return NextResponse.json({ shipment }, { status: 201 });
  } catch (error) {
    console.error('Failed to create outbound shipment:', error);
    return NextResponse.json({ error: 'Failed to submit dispatch', detail: error.message }, { status: 500 });
  }
}
