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
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';

function generateSku({ brandName, typeName, sizeLabel, itemName }) {
  const parts = [brandName, typeName, sizeLabel, itemName]
    .map((value) => normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-'))
    .filter(Boolean);

  return parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '') || generateReference('TILE');
}

function parseSizeLabelSqm(label) {
  if (!label) return null;
  const match = String(label).match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const w = Number(match[1]);
  const l = Number(match[2]);
  if (!w || !l) return null;
  return (w * l) / 1_000_000;
}

function computeSqmValues(item, size) {
  const widthMm = size?.width_mm;
  const lengthMm = size?.length_mm;
  const piecesPerBox = Number(item?.pieces_per_box ?? item?.piecesPerBox) || null;

  let sqmPerTile = null;
  if (widthMm && lengthMm) {
    sqmPerTile = (widthMm * lengthMm) / 1_000_000;
  } else {
    sqmPerTile = parseSizeLabelSqm(size?.label || item?.sizeLabel || item?.size_label);
  }

  if (!sqmPerTile) {
    return { sqmPerBox: null, sqmPerTile: null };
  }

  const sqmPerBox = piecesPerBox ? sqmPerTile * piecesPerBox : null;
  return { sqmPerBox, sqmPerTile };
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

  return null;
}

async function upsertItemMaster(item, orderedBoxes = 0) {
  const existingItem = await resolveExistingItem(item);
  if (existingItem) {
    return existingItem;
  }

  const isBagItem = item.itemCategory === 'bag';
  const schemaCaps = await getStockSchemaCapabilities();

  const brand = await upsertNamedRecord({ table: 'stock_brands', value: item.brandName });

  // Upsert the type and capture its id so we can link type_id on stock_items
  const typeRow = await upsertNamedRecord({
    table: 'stock_types',
    value: item.typeName || (isBagItem ? 'Adhesive' : 'Tile'),
    extra: schemaCaps.hasStockTypesCategory ? (isBagItem ? { category: 'bag' } : { category: 'tile' }) : {},
  });

  let sizeRow = null;
  let division = null;

  if (!isBagItem) {
    sizeRow = await upsertNamedRecord({
      table: 'stock_sizes',
      column: 'label',
      value: item.sizeLabel,
      extra: {
        width_mm: item.widthMm || null,
        length_mm: item.lengthMm || null,
        thickness_mm: item.thicknessMm || null,
        unit: 'mm',
      },
    });

    division = await upsertNamedRecord({
      table: 'stock_divisions',
      value: item.divisionName || item.division || item.department || item.brandName,
    });
  }

  const sku = generateSku({ brandName: brand.name, typeName: item.typeName, sizeLabel: sizeRow?.label || null, itemName: item.itemName });

  const columns = [
    'sku',
    'brand_id',
    'type_id',
    'division_id',
    'size_id',
    'name',
    'finish',
    'grade',
    'unit_of_measure',
    'pieces_per_box',
    'thickness_mm',
  ];

  const values = [
    sku,
    brand.id,
    typeRow?.id || null,
    division?.id || null,
    sizeRow?.id || null,
    normalizeText(item.itemName),
    item.finish || null,
    item.grade || null,
    isBagItem ? 'bag' : (item.unitOfMeasure || 'box'),
    isBagItem ? null : (item.piecesPerBox || null),
    item.thicknessMm || null,
  ];

  if (schemaCaps.hasStockItemsWeightPerUnitKg) {
    columns.push('weight_per_unit_kg');
    values.push(isBagItem ? (item.weightPerUnitKg || null) : null);
  }

  if (schemaCaps.hasStockItemsRatePerBag) {
    columns.push('rate_per_bag');
    values.push(isBagItem ? (item.ratePerBag || null) : null);
  }

  columns.push(
    'reorder_level',
    'safety_stock',
    'purchase_price',
    'landed_cost',
    'selling_price',
    'description'
  );
  values.push(
    Number(orderedBoxes*0.5|| 0),
    item.safetyStock || 0,
    item.purchasePrice || null,
    item.landedCost || null,
    item.sellingPrice || null,
    item.description || null
  );

  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

  const updates = [
    'brand_id = EXCLUDED.brand_id',
    'type_id = EXCLUDED.type_id',
    'division_id = EXCLUDED.division_id',
    'size_id = EXCLUDED.size_id',
    'name = EXCLUDED.name',
    'finish = EXCLUDED.finish',
    'grade = EXCLUDED.grade',
    'unit_of_measure = EXCLUDED.unit_of_measure',
    'pieces_per_box = EXCLUDED.pieces_per_box',
    'thickness_mm = COALESCE(EXCLUDED.thickness_mm, stock_items.thickness_mm)',
  ];

  if (schemaCaps.hasStockItemsWeightPerUnitKg) {
    updates.push('weight_per_unit_kg = COALESCE(EXCLUDED.weight_per_unit_kg, stock_items.weight_per_unit_kg)');
  }

  if (schemaCaps.hasStockItemsRatePerBag) {
    updates.push('rate_per_bag = COALESCE(EXCLUDED.rate_per_bag, stock_items.rate_per_bag)');
  }

  updates.push(
    'reorder_level = EXCLUDED.reorder_level',
    'safety_stock = EXCLUDED.safety_stock',
    'purchase_price = EXCLUDED.purchase_price',
    'landed_cost = EXCLUDED.landed_cost',
    'selling_price = EXCLUDED.selling_price',
    'description = EXCLUDED.description',
    'updated_at = NOW()'
  );

  const rows = await sql(
    `INSERT INTO stock_items (${columns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (sku) DO UPDATE SET
       ${updates.join(',\n       ')}
     RETURNING *`,
    values
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
      `SELECT s.*,
              l.name AS destination_warehouse_name,
              (SELECT COALESCE(SUM(isi.ordered_qty), 0)
               FROM stock_inbound_shipment_items isi
               JOIN stock_items si ON si.id = isi.item_id
               WHERE isi.inbound_shipment_id = s.id AND si.unit_of_measure = 'bag') AS total_bag_qty
       FROM stock_inbound_shipments s
       LEFT JOIN stock_locations l ON l.id = s.destination_location_id
       ORDER BY s.created_at DESC
       LIMIT 50`,
      []
    );

    return NextResponse.json({ shipments });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch purchases', detail: error.message }, { status: 500 });
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

    // ── Group A: resolve customer FK ────────────────────────────────
    let resolvedCustomerId = body.customerId ? Number(body.customerId) : null;
    if (!resolvedCustomerId && body.customerName && normalizeText(body.customerName)) {
      const custName = normalizeText(body.customerName);
      const custInsert = await sql(
        `INSERT INTO stock_customers (name, phone, is_active)
         VALUES ($1, $2, TRUE)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [custName, normalizeText(body.customerPhone) || null]
      );
      if (custInsert[0]) {
        resolvedCustomerId = custInsert[0].id;
      } else {
        const existing = await sql(
          `SELECT id FROM stock_customers WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
          [custName]
        );
        resolvedCustomerId = existing[0]?.id || null;
      }
    }

    // ── Group B: resolve salesperson FK ────────────────────────────
    let resolvedSalespersonId = body.salespersonId ? Number(body.salespersonId) : null;
    if (!resolvedSalespersonId && (body.salespersonName || body.salesPersonName)) {
      const spName = normalizeText(body.salespersonName || body.salesPersonName);
      const spInsert = await sql(
        `INSERT INTO stock_sales_people (name, phone, is_active)
         VALUES ($1, $2, TRUE)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [spName, normalizeText(body.salespersonPhone) || null]
      );
      if (spInsert[0]) {
        resolvedSalespersonId = spInsert[0].id;
      } else {
        const existing = await sql(
          `SELECT id FROM stock_sales_people WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
          [spName]
        );
        resolvedSalespersonId = existing[0]?.id || null;
      }
    }

    // ── Group D: resolve destination location FK ────────────────────
    let resolvedDestLocationId = body.destinationLocationId ? Number(body.destinationLocationId) : null;
    if (!resolvedDestLocationId && body.destinationWarehouseName && normalizeText(body.destinationWarehouseName)) {
      const locName = normalizeText(body.destinationWarehouseName);
      const locInsert = await sql(
        `INSERT INTO stock_locations (name, location_type, is_active)
         VALUES ($1, 'warehouse', TRUE)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [locName]
      );
      if (locInsert[0]) {
        resolvedDestLocationId = locInsert[0].id;
      } else {
        const existing = await sql(
          `SELECT id FROM stock_locations WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
          [locName]
        );
        resolvedDestLocationId = existing[0]?.id || null;
      }
    }

    const shipmentNumber = generateReference('PUR');

    const paymentStatusRaw = normalizeText(body.paymentStatus).toLowerCase();
    const paymentStatus = paymentStatusRaw === 'paid' || paymentStatusRaw === 'partial'
      ? paymentStatusRaw
      : 'unpaid';
    const paidAmount = body.paidAmount != null && body.paidAmount !== '' ? Number(body.paidAmount) : null;
    const paymentDate = body.paymentDate || null;
    const paymentReference = normalizeText(body.paymentReference || body.paymentModeReference) || null;
    const paymentMode = normalizeText(body.paymentMode) || null;

    if ((paymentStatus === 'partial' || paymentStatus === 'paid') && (!Number.isFinite(paidAmount) || paidAmount < 0)) {
      return NextResponse.json({ error: 'Valid paid amount is required when payment status is partial or paid' }, { status: 400 });
    }

    const shipmentRows = await sql(
      `INSERT INTO stock_inbound_shipments (
        shipment_number,
        purchase_order_id,
        supplier_id,
        transporter_id,
        vehicle_id,
        customer_id,
        salesperson_id,
        destination_location_id,
        truck_license_plate_snapshot,
        truck_number_snapshot,
        driver_name_snapshot,
        driver_phone_snapshot,
        arrival_date,
        submitted_at,
        submitted_by_user_id,
        approval_status,
        status,
        invoice_number,
        invoice_date,
        origin_city,
        payment_status,
        paid_amount,
        payment_date,
        payment_reference,
        payment_mode,
        transporter_bill_number,
        transporter_bill_amount,
        delivery_cost,
        unloading_labour_cost,
        total_whole_qty,
        total_broken_qty,
        received_by,
        recorded_by_user_id,
        notes,
        created_by,
        handling_cost_percent,
        fuel_cost_percent,
        gst_percent,
        freight_weight_kg
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        COALESCE($13, NOW()),
        NOW(),
        $14,
        'pending',
        'submitted',
        $15,$16,$17,$18,$19,$20,$21,$22,
        $23,
        $24,
        $25,
        $26,
        $27,
        $28,
        $29,
        $30,
        $31,
        $32,
        $33,
        $34,
        $35,
        $36
      )
      RETURNING *`,
      [
        shipmentNumber,                                // $1
        body.purchaseOrderId || null,                  // $2
        supplier?.id || body.supplierId || null,       // $3
        transporter?.id || body.transporterId || null, // $4
        vehicle[0]?.id || body.vehicleId || null,      // $5
        resolvedCustomerId,                            // $6  ← NEW FK
        resolvedSalespersonId,                         // $7  ← NEW FK
        resolvedDestLocationId,                        // $8  ← NEW FK
        normalizeText(body.truckLicensePlate) || null, // $9
        normalizeText(body.truckNumber) || null,       // $10
        normalizeText(body.driverName) || null,        // $11
        normalizeText(body.driverPhone) || null,       // $12
        body.purchaseDate || body.arrivalDate || null, // $13
        appUser?.id || null,                           // $14
        normalizeText(body.invoiceNumber) || null,     // $15
        body.invoiceDate || null,                      // $16
        normalizeText(body.originCity) || null,        // $17
        paymentStatus,                                 // $18
        Number.isFinite(paidAmount) ? paidAmount : null, // $19
        paymentDate,                                   // $20
        paymentReference,                              // $21
        paymentMode,                                   // $22
        normalizeText(body.transporterBillNumber) || null, // $23
        body.transporterBillAmount || 0,               // $24
        body.deliveryCost || body.transportCost || 0,  // $25
        body.unloadingLabourCost || body.laborCost || 0, // $26
        items.reduce((total, item) => item.itemCategory === 'bag' ? total : total + Number(item.wholeQty || 0), 0), // $27
        items.reduce((total, item) => item.itemCategory === 'bag' ? total : total + Number(item.brokenQty || 0), 0), // $28
        normalizeText(body.receivedBy) || session.user.name || session.user.email, // $29
        appUser?.id || null,                           // $30
        body.notes || null,                            // $31
        session.user.email,                            // $32
        Number(body.handlingCostPercent ?? 1.0),       // $33
        Number(body.fuelCostPercent ?? 5.0),           // $34
        Number(body.gstPercent ?? 18.0),               // $35
        body.freightWeightKg || null,                  // $36
      ]
    );

    const shipment = shipmentRows[0];
    const insertedItems = [];
    const itemDivisionIds = [];
    let subtotal = 0;

    for (const row of items) {
      const isBagRow = row.itemCategory === 'bag';
      const orderedBoxes = isBagRow ? Number(row.qtyBags || 0) : Number(row.orderedBoxes || 0);
      const item = await upsertItemMaster(row, orderedBoxes);
      if (item.division_id) itemDivisionIds.push(item.division_id);

      let whole_qty_sqm = null;
      let broken_qty_sqm = null;
      let ordered_qty_sqm = null;
      let total_cost = 0;

      if (!isBagRow) {
        const sizeRow = item.size_id
          ? (await sql(`SELECT label, width_mm, length_mm FROM stock_sizes WHERE id = $1 LIMIT 1`, [item.size_id]))[0]
          : null;
        const { sqmPerBox } = computeSqmValues(
          { ...item, piecesPerBox: row.piecesPerBox, sizeLabel: row.sizeLabel },
          {
            width_mm: sizeRow?.width_mm || item.width_mm || row.widthMm,
            length_mm: sizeRow?.length_mm || item.length_mm || row.lengthMm,
            label: sizeRow?.label || row.sizeLabel,
          }
        );
        whole_qty_sqm = sqmPerBox != null ? Number((sqmPerBox * Number(row.wholeQty || 0)).toFixed(3)) : null;
        broken_qty_sqm = sqmPerBox != null ? Number((sqmPerBox * Number(row.brokenQty || 0)).toFixed(3)) : null;
        ordered_qty_sqm = sqmPerBox != null ? Number((sqmPerBox * orderedBoxes).toFixed(3)) : null;
        total_cost = ordered_qty_sqm != null && row.costPerSqm
          ? Number((ordered_qty_sqm * Number(row.costPerSqm)).toFixed(2))
          : 0;
      } else {
        // Bag items: total cost = qty * rate per bag
        const ratePerBag = row.ratePerBag != null && row.ratePerBag !== '' ? Number(row.ratePerBag) : 0;
        total_cost = Number((orderedBoxes * ratePerBag).toFixed(2));
      }

      subtotal += total_cost;

      const insertResult = await sql(
        `INSERT INTO stock_inbound_shipment_items (
          inbound_shipment_id,
          item_id,
          ordered_qty,
          received_whole_qty,
          received_broken_qty,
          rejected_qty,
          unit_cost,
          landed_cost,
          hsn_code,
          qty_sqm,
          cost_per_sqm,
          thickness_mm_snapshot,
          whole_qty_sqm,
          broken_qty_sqm,
          ordered_qty_sqm,
          total_cost,
          notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING *`,
        [
          shipment.id,
          item.id,
          orderedBoxes,
          isBagRow ? orderedBoxes : Number(row.wholeQty || 0),
          isBagRow ? 0 : Number(row.brokenQty || 0),
          Number(row.rejectedQty || 0),
          isBagRow ? (row.ratePerBag != null ? Number(row.ratePerBag) : 0) : Number(row.unitPrice || 0),
          isBagRow ? (row.ratePerBag != null ? Number(row.ratePerBag) : 0) : Number(row.landedCost || row.unitPrice || 0),
          normalizeText(row.hsnCode) || null,
          whole_qty_sqm,
          isBagRow ? null : (row.costPerSqm != null && row.costPerSqm !== '' ? Number(row.costPerSqm) : null),
          isBagRow ? null : (row.thicknessMm != null && row.thicknessMm !== '' ? Number(row.thicknessMm) : null),
          whole_qty_sqm,
          broken_qty_sqm,
          ordered_qty_sqm,
          total_cost,
          row.notes || null,
        ]
      );
      insertedItems.push(insertResult[0]);
    }

    const handlingPct = Number(body.handlingCostPercent ?? 1.0);
    const fuelPct = Number(body.fuelCostPercent ?? 5.0);
    const gstPct = Number(body.gstPercent ?? 18.0);
    const grand_total = Number((subtotal + (subtotal * handlingPct / 100) + (subtotal * fuelPct / 100) + (subtotal * gstPct / 100)).toFixed(2));

    await sql(
      `UPDATE stock_inbound_shipments
       SET handling_cost_percent=$1, fuel_cost_percent=$2, gst_percent=$3, grand_total=$4, freight_weight_kg=$5
       WHERE id=$6`,
      [handlingPct, fuelPct, gstPct, grand_total, body.freightWeightKg || null, shipment.id]
    );

    const uniqueDivisionIds = [...new Set(itemDivisionIds)];
    const recipients = await collectNotificationRecipients(uniqueDivisionIds.length ? uniqueDivisionIds : null);
    await queueNotification({
      channel: 'whatsapp',
      eventType: 'inbound_arrival',
      messageText: `New stock purchase submitted: ${shipment.shipment_number}. Review and approve to add to inventory.`,
      recipients,
      sourceTable: 'stock_inbound_shipments',
      sourceId: shipment.id,
      createdBy: session.user.email,
    });

    await recordTimelineEvent({
      eventType: 'inbound_submitted',
      entityType: 'inbound_shipment',
      entityId: shipment.id,
      summary: `Purchase shipment ${shipment.shipment_number} submitted for review`,
      details: { shipmentNumber: shipment.shipment_number, truckLicensePlate: body.truckLicensePlate || null },
      userId: appUser?.id || null,
    });

    return NextResponse.json({ shipment }, { status: 201 });
  } catch (error) {
    console.error('Failed to create inbound shipment:', error);
    return NextResponse.json({ error: 'Failed to submit purchase', detail: error.message }, { status: 500 });
  }
}
