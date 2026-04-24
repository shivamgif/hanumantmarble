import { NextResponse } from 'next/server';
import {
  collectNotificationRecipients,
  ensureDatabaseAvailable,
  generateReference,
  getStockContext,
  hasAnyStockRole,
  normalizeStockRole,
  normalizeText,
  queueNotification,
  recordTimelineEvent,
} from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';

function toPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function resolveStockItem(item) {
  const schemaCaps = await getStockSchemaCapabilities();
  const categorySelect = schemaCaps.hasStockTypesCategory
    ? "COALESCE(t.category, 'tile') AS item_category"
    : "'tile' AS item_category";

  if (item.itemId) {
    const rows = await sql(
      `SELECT i.id, i.sku, i.name, i.current_whole_qty, i.current_broken_qty, i.unit_of_measure,
              ${categorySelect}
       FROM stock_items i
       LEFT JOIN stock_types t ON t.id = i.type_id
       WHERE i.id = $1
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
      `SELECT i.id, i.sku, i.name, i.current_whole_qty, i.current_broken_qty, i.unit_of_measure,
              ${categorySelect}
       FROM stock_items i
       LEFT JOIN stock_types t ON t.id = i.type_id
       WHERE i.sku = $1
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
      `SELECT so.id, so.customer_id, so.notes,
              so.salesperson_id,
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
      `SELECT id AS customer_id, name AS customer_name, phone AS customer_phone,
              whatsapp_phone AS customer_whatsapp_phone, email AS customer_email
       FROM stock_customers
       WHERE id = $1
       LIMIT 1`,
      [body.customerId]
    );

    if (rows[0]) {
      return rows[0];
    }
  }

  if (body.customerName) {
    const trimmedName = body.customerName.trim();
    const trimmedPhone = body.customerPhoneNumber?.trim() || null;

    if (trimmedPhone) {
      const byBoth = await sql(
        `SELECT id AS customer_id, name AS customer_name, phone AS customer_phone,
                whatsapp_phone AS customer_whatsapp_phone, email AS customer_email
         FROM stock_customers
         WHERE lower(name) = lower($1) AND phone = $2
         LIMIT 1`,
        [trimmedName, trimmedPhone]
      );
      if (byBoth[0]) return byBoth[0];
    } else {
      const byName = await sql(
        `SELECT id AS customer_id, name AS customer_name, phone AS customer_phone,
                whatsapp_phone AS customer_whatsapp_phone, email AS customer_email
         FROM stock_customers
         WHERE lower(name) = lower($1)
         LIMIT 1`,
        [trimmedName]
      );
      if (byName[0]) return byName[0];
    }

    const created = await sql(
      `INSERT INTO stock_customers (name, phone)
       VALUES ($1, $2)
       RETURNING id AS customer_id, name AS customer_name, phone AS customer_phone,
                 NULL AS customer_whatsapp_phone, NULL AS customer_email`,
      [trimmedName, trimmedPhone]
    );
    return created[0];
  }

  return null;
}

/**
 * Resolves or upserts a salesperson record and returns their id.
 * Accepts salespersonId (FK) directly, or upserts by name.
 */
async function resolveSalespersonId(body, resolvedCustomer) {
  if (body.salespersonId) {
    return Number(body.salespersonId);
  }

  // Inherit from the linked sales order if available
  if (resolvedCustomer?.salesperson_id) {
    return resolvedCustomer.salesperson_id;
  }

  const spName = normalizeText(
    body.salespersonName || body.salesPersonName || resolvedCustomer?.sales_person
  );
  const spPhone = normalizeText(body.salespersonPhone || body.salesPersonPhone);

  if (!spName) {
    return null;
  }

  const rows = await sql(
    `INSERT INTO stock_sales_people (name, phone, is_active)
     VALUES ($1, $2, TRUE)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [spName, spPhone || '']
  );

  if (rows[0]) {
    return rows[0].id;
  }

  // Already exists — look it up
  const existing = await sql(
    `SELECT id FROM stock_sales_people
     WHERE lower(trim(name)) = lower(trim($1))
     LIMIT 1`,
    [spName]
  );
  return existing[0]?.id || null;
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

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer', 'salesperson'])) {
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

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer', 'salesperson'])) {
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

    // Resolve FK IDs — dual-write with legacy text columns during transition
    const resolvedCustomerId = resolvedCustomer?.customer_id || null;
    const resolvedSalespersonId = await resolveSalespersonId(body, resolvedCustomer);

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
    const submitterRole = normalizeStockRole(appUser?.role);

    if (!customerName) {
      return NextResponse.json({ error: 'customerName is required' }, { status: 400 });
    }

    const resolvedItems = [];
    for (const item of items) {
      const stockItem = await resolveStockItem(item);
      const isBagItem = stockItem.item_category === 'bag' || item.itemCategory === 'bag';
      const loadedWholeQty = isBagItem ? 0 : toPositiveInteger(item.loadedWholeQty ?? item.wholeQty);
      const loadedBrokenQty = isBagItem ? 0 : toPositiveInteger(item.loadedBrokenQty ?? item.brokenQty);
      const qtyBags = isBagItem ? toPositiveInteger(item.qtyBags ?? item.loadedWholeQty) : 0;
      const deliveredWholeQty = toPositiveInteger(item.deliveredWholeQty);
      const deliveredBrokenQty = toPositiveInteger(item.deliveredBrokenQty);
      const returnedWholeQty = toPositiveInteger(item.returnedWholeQty);
      const returnedBrokenQty = toPositiveInteger(item.returnedBrokenQty);

      if (!isBagItem && loadedWholeQty === 0 && loadedBrokenQty === 0) {
        return NextResponse.json({ error: 'Each outbound item row needs whole or broken quantity' }, { status: 400 });
      }

      if (isBagItem && qtyBags === 0) {
        return NextResponse.json({ error: 'Each bag item row needs a quantity in bags' }, { status: 400 });
      }

      // Reject dispatch quantities that exceed current available stock.
      const availWhole = Number(stockItem.current_whole_qty || 0);
      const availBroken = Number(stockItem.current_broken_qty || 0);
      const effectiveWhole = isBagItem ? qtyBags : loadedWholeQty;
      if (effectiveWhole > availWhole) {
        return NextResponse.json(
          { error: `Requested qty ${effectiveWhole} exceeds available ${availWhole} for ${stockItem.sku}` },
          { status: 400 }
        );
      }
      if (loadedBrokenQty > availBroken) {
        return NextResponse.json(
          { error: `Requested broken qty ${loadedBrokenQty} exceeds available ${availBroken} for ${stockItem.sku}` },
          { status: 400 }
        );
      }

      resolvedItems.push({
        item: stockItem,
        isBagItem,
        loadedWholeQty: isBagItem ? qtyBags : loadedWholeQty,
        loadedBrokenQty,
        deliveredWholeQty,
        deliveredBrokenQty,
        returnedWholeQty,
        returnedBrokenQty,
        sellUnit: isBagItem ? 'bag' : (item.sellUnit || 'box'),
        ratePerUnit: item.ratePerUnit != null && item.ratePerUnit !== '' ? Number(item.ratePerUnit) : null,
        notes: normalizeText(item.notes) || null,
      });
    }

    const shipmentRows = await sql(
      `INSERT INTO stock_outbound_shipments (
        shipment_number,
        sales_order_id,
        vehicle_id,
        customer_id,
        salesperson_id,
        truck_license_plate_snapshot,
        truck_number_snapshot,
        driver_name_snapshot,
        driver_phone_snapshot,
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
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        NOW(),
        $12,
        $13,
        $14,
        COALESCE($15, NOW()),
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
        shipmentNumber,           // $1
        body.salesOrderId || null, // $2
        vehicleId,                 // $3
        resolvedCustomerId,        // $4  ← NEW FK
        resolvedSalespersonId,     // $5  ← NEW FK
        truckLicensePlate || null, // $6
        truckNumber || null,       // $7
        driverName || null,        // $8
        driverPhone || null,       // $9
        normalizeText(body.gatepassNumber) || null,  // $10
        normalizeText(body.invoiceNumber) || null,   // $11
        appUser?.id || null,       // $12
        approvalStatus,            // $13
        status,                    // $14
        dispatchDate,              // $15
        Number(body.loadingLabourCost || 0), // $16
        Number(body.transportCost || 0),     // $17
        toPositiveInteger(body.returnBrokenQty), // $18
        normalizeText(body.returnNotes) || null,  // $19
        appUser?.id || null,       // $20
        normalizeText(body.notes) || null, // $21
        session.user.email,        // $22
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
          sell_unit,
          rate_per_unit,
          notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          shipment.id,
          row.item.id,
          row.loadedWholeQty,
          row.loadedBrokenQty,
          row.deliveredWholeQty,
          row.deliveredBrokenQty,
          row.returnedWholeQty,
          row.returnedBrokenQty,
          row.sellUnit,
          row.ratePerUnit,
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
        submitterRole,
        submitterType: submitterRole === 'salesperson' ? 'salesperson' : 'stock_manager',
      },
      userId: appUser?.id || null,
    });

    return NextResponse.json({ shipment }, { status: 201 });
  } catch (error) {
    console.error('Failed to create outbound shipment:', error);
    return NextResponse.json({ error: 'Failed to submit dispatch', detail: error.message }, { status: 500 });
  }
}
