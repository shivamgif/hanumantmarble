#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const neonSql = neon(DATABASE_URL);

function sql(text, params = []) {
  return neonSql.query(text, params);
}

function parseArgs(argv) {
  const args = {
    confirmReset: false,
    dryRun: false,
    seed: 20260414,
  };

  for (const raw of argv) {
    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (raw.startsWith('--confirm-reset=')) {
      args.confirmReset = raw.split('=')[1] === 'true';
      continue;
    }

    if (raw.startsWith('--seed=')) {
      const parsed = Number(raw.split('=')[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.seed = Math.floor(parsed);
      }
    }
  }

  return args;
}

function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(rng, min, max, precision = 2) {
  const value = min + (max - min) * rng();
  return Number(value.toFixed(precision));
}

function pick(rng, list) {
  return list[randInt(rng, 0, list.length - 1)];
}

function pickMany(rng, list, count) {
  const copy = [...list];
  const output = [];
  const target = Math.min(count, copy.length);

  while (output.length < target && copy.length > 0) {
    const idx = randInt(rng, 0, copy.length - 1);
    output.push(copy[idx]);
    copy.splice(idx, 1);
  }

  return output;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'value';
}

function formatDateYYYYMMDD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function randomDateInRange(rng, startDate, endDate) {
  const start = startDate.getTime();
  const end = endDate.getTime();
  const time = Math.floor(start + (end - start) * rng());
  return new Date(time);
}

function weightedPick(rng, weighted) {
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * total;

  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.value;
    }
  }

  return weighted[weighted.length - 1].value;
}

async function getCurrentCounts() {
  const [inbound, outbound, users] = await Promise.all([
    sql('SELECT COUNT(*)::INTEGER AS c FROM stock_inbound_shipments', []),
    sql('SELECT COUNT(*)::INTEGER AS c FROM stock_outbound_shipments', []),
    sql('SELECT COUNT(*)::INTEGER AS c FROM stock_app_users', []),
  ]);

  return {
    inboundShipments: inbound[0]?.c || 0,
    outboundShipments: outbound[0]?.c || 0,
    users: users[0]?.c || 0,
  };
}

async function runResetTransaction() {
  await sql('BEGIN', []);

  try {
    // Gather ids first to avoid accidental cross-entity deletes.
    const inboundIdsRows = await sql('SELECT id FROM stock_inbound_shipments', []);
    const outboundIdsRows = await sql('SELECT id FROM stock_outbound_shipments', []);
    const inboundIds = inboundIdsRows.map((r) => Number(r.id)).filter(Number.isFinite);
    const outboundIds = outboundIdsRows.map((r) => Number(r.id)).filter(Number.isFinite);

    if (inboundIds.length > 0 || outboundIds.length > 0) {
      await sql(
        `DELETE FROM stock_notifications
         WHERE (source_table = 'stock_inbound_shipments' AND source_id = ANY($1::bigint[]))
            OR (source_table = 'stock_outbound_shipments' AND source_id = ANY($2::bigint[]))`,
        [inboundIds, outboundIds]
      );

      await sql(
        `DELETE FROM stock_timeline_events
         WHERE (entity_type = 'inbound_shipment' AND entity_id = ANY($1::bigint[]))
            OR (entity_type = 'outbound_shipment' AND entity_id = ANY($2::bigint[]))`,
        [inboundIds, outboundIds]
      );

      await sql(
        `DELETE FROM stock_change_requests
         WHERE (source_entity_type = 'inbound_shipment' AND source_entity_id = ANY($1::bigint[]))
            OR (source_entity_type = 'outbound_shipment' AND source_entity_id = ANY($2::bigint[]))`,
        [inboundIds, outboundIds]
      );

      await sql(
        `DELETE FROM stock_cost_entries
         WHERE (related_entity_type = 'inbound_shipment' AND related_entity_id = ANY($1::bigint[]))
            OR (related_entity_type = 'outbound_shipment' AND related_entity_id = ANY($2::bigint[]))`,
        [inboundIds, outboundIds]
      );

      await sql(
        `DELETE FROM stock_customer_acknowledgements
         WHERE outbound_shipment_id = ANY($1::bigint[])`,
        [outboundIds]
      );

      await sql(
        `DELETE FROM stock_movements
         WHERE (source_type = 'inbound_shipment' AND source_id = ANY($1::bigint[]))
            OR (source_type = 'outbound_shipment' AND source_id = ANY($2::bigint[]))`,
        [inboundIds, outboundIds]
      );

      await sql(
        `DELETE FROM stock_inventory_lots
         WHERE source_table = 'stock_inbound_shipments'
           AND source_id = ANY($1::bigint[])`,
        [inboundIds]
      );

      await sql(
        `DELETE FROM stock_documents
         WHERE (entity_type = 'inbound_shipment' AND entity_id = ANY($1::bigint[]))
            OR (entity_type = 'outbound_shipment' AND entity_id = ANY($2::bigint[]))`,
        [inboundIds, outboundIds]
      );

      await sql(
        `DELETE FROM stock_outbound_shipment_items
         WHERE outbound_shipment_id = ANY($1::bigint[])`,
        [outboundIds]
      );

      await sql(
        `DELETE FROM stock_inbound_shipment_items
         WHERE inbound_shipment_id = ANY($1::bigint[])`,
        [inboundIds]
      );

      await sql('DELETE FROM stock_outbound_shipments', []);
      await sql('DELETE FROM stock_inbound_shipments', []);
    }

    await sql(
      `UPDATE stock_items
       SET current_whole_qty = 0,
           current_broken_qty = 0,
           reserved_whole_qty = 0,
           reserved_broken_qty = 0,
           updated_at = NOW()`,
      []
    );

    await sql('COMMIT', []);
  } catch (error) {
    await sql('ROLLBACK', []);
    throw error;
  }
}

async function ensureDivision(name) {
  const rows = await sql(
    `INSERT INTO stock_divisions (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
     RETURNING id, name`,
    [name]
  );
  return rows[0];
}

async function ensureBrand(name) {
  const rows = await sql(
    `INSERT INTO stock_brands (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
     RETURNING id, name`,
    [name]
  );
  return rows[0];
}

async function ensureType(name) {
  const rows = await sql(
    `INSERT INTO stock_types (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
     RETURNING id, name`,
    [name]
  );
  return rows[0];
}

async function ensureSize(label, widthMm, lengthMm, thicknessMm) {
  const rows = await sql(
    `INSERT INTO stock_sizes (label, width_mm, length_mm, thickness_mm)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (label) DO UPDATE SET
       width_mm = COALESCE(EXCLUDED.width_mm, stock_sizes.width_mm),
       length_mm = COALESCE(EXCLUDED.length_mm, stock_sizes.length_mm),
       thickness_mm = COALESCE(EXCLUDED.thickness_mm, stock_sizes.thickness_mm),
       updated_at = NOW()
     RETURNING id, label`,
    [label, widthMm, lengthMm, thicknessMm]
  );
  return rows[0];
}

async function ensureSupplier({ name, gstNumber, phone, address }) {
  const rows = await sql(
    `INSERT INTO stock_suppliers (name, gst_number, phone, address)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (name) DO UPDATE SET
       gst_number = COALESCE(EXCLUDED.gst_number, stock_suppliers.gst_number),
       phone = COALESCE(EXCLUDED.phone, stock_suppliers.phone),
       address = COALESCE(EXCLUDED.address, stock_suppliers.address),
       updated_at = NOW()
     RETURNING id, name`,
    [name, gstNumber || null, phone || null, address || null]
  );
  return rows[0];
}

async function ensureTransporter({ name, phone, vehicleNumber }) {
  const rows = await sql(
    `INSERT INTO stock_transporters (name, phone, vehicle_number)
     VALUES ($1,$2,$3)
     ON CONFLICT (name) DO UPDATE SET
       phone = COALESCE(EXCLUDED.phone, stock_transporters.phone),
       vehicle_number = COALESCE(EXCLUDED.vehicle_number, stock_transporters.vehicle_number),
       updated_at = NOW()
     RETURNING id, name`,
    [name, phone || null, vehicleNumber || null]
  );
  return rows[0];
}

async function ensureVehicle({ vehicleNumber, transporterId, driverName, driverPhone }) {
  const rows = await sql(
    `INSERT INTO stock_vehicles (vehicle_number, driver_name, driver_phone, transporter_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (vehicle_number) DO UPDATE SET
       driver_name = COALESCE(EXCLUDED.driver_name, stock_vehicles.driver_name),
       driver_phone = COALESCE(EXCLUDED.driver_phone, stock_vehicles.driver_phone),
       transporter_id = COALESCE(EXCLUDED.transporter_id, stock_vehicles.transporter_id),
       updated_at = NOW()
     RETURNING id, vehicle_number`,
    [vehicleNumber, driverName || null, driverPhone || null, transporterId || null]
  );
  return rows[0];
}

async function ensureCustomer({ name, phone }) {
  const rows = await sql(
    `INSERT INTO stock_customers (name, phone)
     VALUES ($1,$2)
     ON CONFLICT DO NOTHING
     RETURNING id, name`,
    [name, phone || null]
  );

  if (rows[0]) {
    return rows[0];
  }

  const existing = await sql(
    `SELECT id, name FROM stock_customers WHERE name = $1 ORDER BY id ASC LIMIT 1`,
    [name]
  );
  return existing[0];
}

function buildUserFixtures() {
  return {
    admin: [
      { name: 'Amit Sharma', email: 'amit.admin@hanumant.local', phone: '9000001001', department: 'Control' },
    ],
    manager: [
      { name: 'Pooja Verma', email: 'pooja.manager@hanumant.local', phone: '9000002001', department: 'Operations' },
      { name: 'Rakesh Yadav', email: 'rakesh.manager@hanumant.local', phone: '9000002002', department: 'Commercial' },
    ],
    stock_maintainer: [
      { name: 'Neeraj Gupta', email: 'neeraj.maint@hanumant.local', phone: '9000003001', department: 'Warehouse-A' },
      { name: 'Sonal Jain', email: 'sonal.maint@hanumant.local', phone: '9000003002', department: 'Warehouse-B' },
      { name: 'Dinesh Rawat', email: 'dinesh.maint@hanumant.local', phone: '9000003003', department: 'Inbound' },
      { name: 'Mukesh Singh', email: 'mukesh.maint@hanumant.local', phone: '9000003004', department: 'Outbound' },
      { name: 'Kiran Pal', email: 'kiran.maint@hanumant.local', phone: '9000003005', department: 'Inventory' },
      { name: 'Anita Das', email: 'anita.maint@hanumant.local', phone: '9000003006', department: 'Yard' },
    ],
    salesperson: [
      { name: 'Sandeep Marble', email: 'sandeep.sales1@hanumant.local', phone: '9000004001', department: 'Marble' },
      { name: 'Alok Marble', email: 'alok.sales2@hanumant.local', phone: '9000004002', department: 'Marble' },
      { name: 'Priya Granite', email: 'priya.sales1@hanumant.local', phone: '9000004003', department: 'Granite' },
      { name: 'Ritu Granite', email: 'ritu.sales2@hanumant.local', phone: '9000004004', department: 'Granite' },
      { name: 'Farhan Designer', email: 'farhan.sales1@hanumant.local', phone: '9000004005', department: 'Designer' },
      { name: 'Kunal Designer', email: 'kunal.sales2@hanumant.local', phone: '9000004006', department: 'Designer' },
      { name: 'Gaurav Porcelain', email: 'gaurav.sales1@hanumant.local', phone: '9000004007', department: 'Porcelain' },
      { name: 'Nikita Porcelain', email: 'nikita.sales2@hanumant.local', phone: '9000004008', department: 'Porcelain' },
    ],
  };
}

async function upsertUsersAndGetMaps() {
  const fixtures = buildUserFixtures();
  const roleOrder = ['admin', 'manager', 'stock_maintainer', 'salesperson'];

  for (const role of roleOrder) {
    for (const fixture of fixtures[role]) {
      const divisionRows = await sql(
        `SELECT id FROM stock_divisions WHERE name = $1 LIMIT 1`,
        [fixture.department]
      );
      const divisionId = divisionRows[0]?.id || null;

      await sql(
        `INSERT INTO stock_app_users (
           auth0_sub, name, phone, email, role, department, division_id, status,
           can_manage_users, can_approve_changes, can_view_dashboard, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,TRUE,'reset-seed-script')
         ON CONFLICT (email) DO UPDATE SET
           auth0_sub = EXCLUDED.auth0_sub,
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           role = EXCLUDED.role,
           department = EXCLUDED.department,
           division_id = EXCLUDED.division_id,
           status = 'active',
           can_manage_users = EXCLUDED.can_manage_users,
           can_approve_changes = EXCLUDED.can_approve_changes,
           can_view_dashboard = TRUE,
           updated_at = NOW()`,
        [
          `seed|${slugify(fixture.email)}`,
          fixture.name,
          fixture.phone,
          fixture.email,
          role,
          fixture.department,
          divisionId,
          role === 'admin' || role === 'manager',
          role === 'admin' || role === 'manager',
        ]
      );
    }
  }

  const users = await sql(
    `SELECT id, name, email, role, department
     FROM stock_app_users
     WHERE email LIKE '%@hanumant.local'
     ORDER BY id ASC`,
    []
  );

  const byRole = {
    admin: users.filter((u) => u.role === 'admin'),
    manager: users.filter((u) => u.role === 'manager'),
    stock_maintainer: users.filter((u) => u.role === 'stock_maintainer'),
    salesperson: users.filter((u) => u.role === 'salesperson'),
  };

  return { users, byRole };
}

function makeProductCatalog() {
  return [
    { name: 'Bianco Antico', size: '600x600mm', widthMm: 600, lengthMm: 600, thicknessMm: 9.0, hsn: '69072200', piecesPerBox: 4, division: 'Marble', baseCostPerSqm: 395 },
    { name: 'Cape White Marble', size: '600x1200mm', widthMm: 600, lengthMm: 1200, thicknessMm: 9.0, hsn: '69072200', piecesPerBox: 3, division: 'Marble', baseCostPerSqm: 410 },
    { name: 'Emil Cedar', size: '300x450mm', widthMm: 300, lengthMm: 450, thicknessMm: 8.5, hsn: '69072300', piecesPerBox: 6, division: 'Designer', baseCostPerSqm: 360 },
    { name: 'Lady Gudiva Silver - Matt', size: '600x600mm', widthMm: 600, lengthMm: 600, thicknessMm: 9.0, hsn: '69072200', piecesPerBox: 4, division: 'Designer', baseCostPerSqm: 388 },
    { name: 'Milazzo Copper', size: '600x1200mm', widthMm: 600, lengthMm: 1200, thicknessMm: 9.5, hsn: '69072200', piecesPerBox: 3, division: 'Designer', baseCostPerSqm: 435 },
    { name: 'Polished Wood Dark', size: '300x300mm', widthMm: 300, lengthMm: 300, thicknessMm: 8.0, hsn: '69072300', piecesPerBox: 10, division: 'Porcelain', baseCostPerSqm: 342 },
    { name: 'Sapphire Marfil', size: '300x450mm', widthMm: 300, lengthMm: 450, thicknessMm: 8.5, hsn: '69072300', piecesPerBox: 6, division: 'Granite', baseCostPerSqm: 372 },
    { name: 'Vega Gris', size: '300x300mm', widthMm: 300, lengthMm: 300, thicknessMm: 8.0, hsn: '69072300', piecesPerBox: 10, division: 'Granite', baseCostPerSqm: 350 },
    { name: 'Roca Ivory Prime', size: '600x600mm', widthMm: 600, lengthMm: 600, thicknessMm: 9.0, hsn: '69072200', piecesPerBox: 4, division: 'Porcelain', baseCostPerSqm: 402 },
    { name: 'Graphite Slate Edge', size: '600x1200mm', widthMm: 600, lengthMm: 1200, thicknessMm: 10.0, hsn: '69072200', piecesPerBox: 3, division: 'Granite', baseCostPerSqm: 448 },
  ];
}

function sqmPerTile(product) {
  return (product.widthMm / 1000) * (product.lengthMm / 1000);
}

function sqmPerBox(product) {
  return sqmPerTile(product) * product.piecesPerBox;
}

async function ensureItems(catalog) {
  const brand = await ensureBrand('Kajaria Ceramics Limited');
  const type = await ensureType('Vitrified Tile');

  const items = [];

  for (const p of catalog) {
    const division = await ensureDivision(p.division);
    const size = await ensureSize(p.size, p.widthMm, p.lengthMm, p.thicknessMm);

    const sku = `KAJ-${slugify(p.name).toUpperCase()}-${p.size.replace(/[^0-9]/g, '')}`;

    const rows = await sql(
      `INSERT INTO stock_items (
         sku, brand_id, type_id, division_id, size_id, department, name,
         grade, series, pieces_per_box, thickness_mm, unit_of_measure,
         purchase_price, landed_cost, selling_price, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PRM',$8,$9,$10,'box',$11,$12,$13,TRUE)
       ON CONFLICT (sku) DO UPDATE SET
         brand_id = EXCLUDED.brand_id,
         type_id = EXCLUDED.type_id,
         division_id = EXCLUDED.division_id,
         size_id = EXCLUDED.size_id,
         department = EXCLUDED.department,
         name = EXCLUDED.name,
         grade = 'PRM',
         series = EXCLUDED.series,
         pieces_per_box = EXCLUDED.pieces_per_box,
         thickness_mm = EXCLUDED.thickness_mm,
         purchase_price = EXCLUDED.purchase_price,
         landed_cost = EXCLUDED.landed_cost,
         selling_price = EXCLUDED.selling_price,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING id, sku, name, pieces_per_box, thickness_mm, department`,
      [
        sku,
        brand.id,
        type.id,
        division.id,
        size.id,
        p.division,
        p.name,
        `${p.division} Classic`,
        p.piecesPerBox,
        p.thicknessMm,
        Number((p.baseCostPerSqm * sqmPerBox(p)).toFixed(2)),
        Number((p.baseCostPerSqm * sqmPerBox(p) * 1.05).toFixed(2)),
        Number((p.baseCostPerSqm * sqmPerBox(p) * 1.35).toFixed(2)),
      ]
    );

    items.push({
      ...p,
      id: rows[0].id,
      sku: rows[0].sku,
      piecesPerBox: Number(rows[0].pieces_per_box || p.piecesPerBox),
      thicknessMm: Number(rows[0].thickness_mm || p.thicknessMm),
      department: rows[0].department || p.division,
    });
  }

  return items;
}

async function ensureMasters() {
  const suppliers = [
    await ensureSupplier({
      name: 'Kajaria Ceramics Limited (Gailpur Plant)',
      gstNumber: '08AABCK1613R1ZB',
      phone: '01430243501',
      address: 'Gailpur, Rajasthan',
    }),
    await ensureSupplier({
      name: 'Shivam Ceramix Pvt Ltd',
      gstNumber: '09AACCS9911P1ZT',
      phone: '01140404040',
      address: 'Noida, Uttar Pradesh',
    }),
    await ensureSupplier({
      name: 'Apex Tile Works',
      gstNumber: '24AABCA7788B1ZL',
      phone: '07930001122',
      address: 'Morbi, Gujarat',
    }),
  ];

  const transporters = [
    await ensureTransporter({ name: 'ATM Cargo Movers (R)', phone: '9412345678', vehicleNumber: 'UP82T6714' }),
    await ensureTransporter({ name: 'Rudra Freight Lines', phone: '9450001234', vehicleNumber: 'RJ14GC2201' }),
    await ensureTransporter({ name: 'NorthLane Logistics', phone: '9811007788', vehicleNumber: 'HR38K9931' }),
  ];

  const vehicleSeeds = [
    { vehicleNumber: 'UP82T6714', driverName: 'Naveen Singh', driverPhone: '9898000011', transporterId: transporters[0].id },
    { vehicleNumber: 'RJ14GC2201', driverName: 'Arjun Meena', driverPhone: '9898000012', transporterId: transporters[1].id },
    { vehicleNumber: 'HR38K9931', driverName: 'Rafiq Khan', driverPhone: '9898000013', transporterId: transporters[2].id },
    { vehicleNumber: 'UP32NF5591', driverName: 'Kailash Pal', driverPhone: '9898000014', transporterId: transporters[0].id },
    { vehicleNumber: 'DL1LG4402', driverName: 'Suresh Devi', driverPhone: '9898000015', transporterId: transporters[1].id },
  ];

  const vehicles = [];
  for (const v of vehicleSeeds) {
    vehicles.push(await ensureVehicle(v));
  }

  const customerSeeds = [
    { name: 'Hanumant Retail Counter A', phone: '9123400101' },
    { name: 'Riverview Builders', phone: '9123400102' },
    { name: 'Shree Krishna Interiors', phone: '9123400103' },
    { name: 'Lucknow Decor Studio', phone: '9123400104' },
    { name: 'Urban Arc Projects', phone: '9123400105' },
    { name: 'Nova Housing LLP', phone: '9123400106' },
    { name: 'Aarav Estates', phone: '9123400107' },
    { name: 'Om Sai Traders', phone: '9123400108' },
  ];

  const customers = [];
  for (const c of customerSeeds) {
    customers.push(await ensureCustomer(c));
  }

  return { suppliers, transporters, vehicles, customers };
}

async function insertInboundHeader(payload) {
  const rows = await sql(
    `INSERT INTO stock_inbound_shipments (
       shipment_number, supplier_id, transporter_id, vehicle_id,
       truck_license_plate, truck_number, driver_name, driver_phone,
       arrival_date, submitted_at, submitted_by_user_id,
       reviewed_at, reviewed_by_user_id,
       approval_status, approval_notes,
       approved_at, approved_by_user_id,
       invoice_number, invoice_date,
       origin_city, destination_warehouse_name,
       payment_status, paid_amount, payment_date, payment_reference, payment_mode,
       delivery_cost, unloading_labour_cost,
       total_whole_qty, total_broken_qty,
       status, received_date, received_by, recorded_by_user_id,
       notes, created_by
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6,$7,$8,
       $9,$10,$11,
       $12,$13,
       $14,$15,
       $16,$17,
       $18,$19,
       $20,$21,
       $22,$23,$24,$25,$26,
       $27,$28,
       $29,$30,
       $31,$32,$33,$34,
       $35,$36
     ) RETURNING *`,
    [
      payload.shipmentNumber,
      payload.supplierId,
      payload.transporterId,
      payload.vehicleId,
      payload.truckLicensePlate,
      payload.truckNumber,
      payload.driverName,
      payload.driverPhone,
      payload.arrivalDate,
      payload.submittedAt,
      payload.submittedByUserId,
      payload.reviewedAt,
      payload.reviewedByUserId,
      payload.approvalStatus,
      payload.approvalNotes,
      payload.approvedAt,
      payload.approvedByUserId,
      payload.invoiceNumber,
      payload.invoiceDate,
      payload.originCity,
      payload.destinationWarehouseName,
      payload.paymentStatus,
      payload.paidAmount,
      payload.paymentDate,
      payload.paymentReference,
      payload.paymentMode,
      payload.deliveryCost,
      payload.unloadingLabourCost,
      payload.totalWholeQty,
      payload.totalBrokenQty,
      payload.status,
      payload.receivedDate,
      payload.receivedBy,
      payload.recordedByUserId,
      payload.notes,
      payload.createdBy,
    ]
  );

  return rows[0];
}

async function insertInboundItem(payload) {
  const rows = await sql(
    `INSERT INTO stock_inbound_shipment_items (
       inbound_shipment_id, item_id,
       ordered_qty, received_whole_qty, received_broken_qty, rejected_qty,
       unit_cost, landed_cost, hsn_code, qty_sqm, cost_per_sqm, thickness_mm_snapshot,
       notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      payload.inboundShipmentId,
      payload.itemId,
      payload.orderedQty,
      payload.receivedWholeQty,
      payload.receivedBrokenQty,
      payload.rejectedQty,
      payload.unitCost,
      payload.landedCost,
      payload.hsnCode,
      payload.qtySqm,
      payload.costPerSqm,
      payload.thicknessMmSnapshot,
      payload.notes,
    ]
  );

  return rows[0];
}

async function applyInboundApprovedStock({ shipment, lines }) {
  for (const line of lines) {
    await sql(
      `UPDATE stock_items
       SET current_whole_qty = current_whole_qty + $1,
           current_broken_qty = current_broken_qty + $2,
           updated_at = NOW()
       WHERE id = $3`,
      [line.receivedWholeQty, line.receivedBrokenQty, line.itemId]
    );

    if (line.receivedWholeQty > 0) {
      const lotRows = await sql(
        `INSERT INTO stock_inventory_lots (
           lot_number, item_id, source_type, source_table, source_id,
           tile_condition, quantity_received, quantity_available,
           unit_cost, landed_cost, qc_status, notes, created_by
         ) VALUES ($1,$2,'purchase','stock_inbound_shipments',$3,'whole',$4,$4,$5,$6,'passed',$7,$8)
         RETURNING id`,
        [
          `LOT-${shipment.shipment_number}-${line.itemId}-W`,
          line.itemId,
          shipment.id,
          line.receivedWholeQty,
          line.unitCost,
          line.landedCost,
          'Seed approved purchase whole stock',
          shipment.created_by,
        ]
      );

      await sql(
        `INSERT INTO stock_movements (
           movement_number, movement_type, direction, item_id,
           inventory_lot_id, quantity, tile_condition,
           unit_cost, labour_cost, transport_cost,
           source_type, source_id, reference_number, notes, created_by
         ) VALUES (
           $1,'purchase_receive','in',$2,
           $3,$4,'whole',
           $5,$6,$7,
           'inbound_shipment',$8,$9,$10,$11
         )`,
        [
          `MOV-${shipment.shipment_number}-${line.itemId}-W`,
          line.itemId,
          lotRows[0].id,
          line.receivedWholeQty,
          line.unitCost,
          shipment.unloading_labour_cost || 0,
          shipment.delivery_cost || 0,
          shipment.id,
          shipment.invoice_number || shipment.shipment_number,
          'Seed approved purchase whole movement',
          shipment.created_by,
        ]
      );
    }

    if (line.receivedBrokenQty > 0) {
      const lotRows = await sql(
        `INSERT INTO stock_inventory_lots (
           lot_number, item_id, source_type, source_table, source_id,
           tile_condition, quantity_received, quantity_available,
           unit_cost, landed_cost, qc_status, notes, created_by
         ) VALUES ($1,$2,'purchase','stock_inbound_shipments',$3,'broken',$4,$4,$5,$6,'passed',$7,$8)
         RETURNING id`,
        [
          `LOT-${shipment.shipment_number}-${line.itemId}-B`,
          line.itemId,
          shipment.id,
          line.receivedBrokenQty,
          line.unitCost,
          line.landedCost,
          'Seed approved purchase broken stock',
          shipment.created_by,
        ]
      );

      await sql(
        `INSERT INTO stock_movements (
           movement_number, movement_type, direction, item_id,
           inventory_lot_id, quantity, tile_condition,
           unit_cost, labour_cost, transport_cost,
           source_type, source_id, reference_number, notes, created_by
         ) VALUES (
           $1,'purchase_receive','in',$2,
           $3,$4,'broken',
           $5,$6,$7,
           'inbound_shipment',$8,$9,$10,$11
         )`,
        [
          `MOV-${shipment.shipment_number}-${line.itemId}-B`,
          line.itemId,
          lotRows[0].id,
          line.receivedBrokenQty,
          line.unitCost,
          shipment.unloading_labour_cost || 0,
          shipment.delivery_cost || 0,
          shipment.id,
          shipment.invoice_number || shipment.shipment_number,
          'Seed approved purchase broken movement',
          shipment.created_by,
        ]
      );
    }
  }
}

async function createInboundDocument({ shipmentId, invoiceNumber, createdBy }) {
  const docRows = await sql(
    `INSERT INTO stock_documents (
       document_number, document_type, entity_type, entity_id,
       file_name, file_url, mime_type, file_size_bytes, notes, created_by
     ) VALUES ($1,'purchase_invoice','inbound_shipment',$2,$3,$4,'text/plain',$5,$6,$7)
     RETURNING id`,
    [
      invoiceNumber,
      shipmentId,
      `${invoiceNumber}.txt`,
      'data:text/plain;base64,U2VlZGVkIHB1cmNoYXNlIGludm9pY2U=',
      30,
      'Seeded purchase invoice',
      createdBy,
    ]
  );

  await sql(
    `UPDATE stock_inbound_shipments
     SET invoice_document_id = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [docRows[0].id, shipmentId]
  );
}

async function seedInboundShipments({ rng, usersByRole, masters, items }) {
  const purchaseCount = 36;
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - 180);
  const endDate = new Date();

  const statuses = [
    { approvalStatus: 'approved', status: 'received', weight: 45 },
    { approvalStatus: 'pending', status: 'submitted', weight: 25 },
    { approvalStatus: 'rejected', status: 'cancelled', weight: 10 },
    { approvalStatus: 'changes_requested', status: 'submitted', weight: 10 },
    { approvalStatus: 'reviewed', status: 'arrived', weight: 10 },
  ];

  const transportCities = ['Gailpur', 'Morbi', 'Noida', 'Jaipur', 'Ahmedabad'];
  const warehouseNames = ['Lucknow Main Yard', 'Kanpur Warehouse', 'Ayodhya Depot', 'Varanasi Hub'];

  const created = [];

  for (let i = 0; i < purchaseCount; i += 1) {
    const supplier = pick(rng, masters.suppliers);
    const transporter = pick(rng, masters.transporters);
    const vehicle = pick(rng, masters.vehicles);
    const maintainer = pick(rng, usersByRole.stock_maintainer);
    const approver = pick(rng, [...usersByRole.admin, ...usersByRole.manager]);
    const shipmentDate = randomDateInRange(rng, startDate, endDate);

    const selectedStatus = weightedPick(rng, statuses.map((s) => ({ value: s, weight: s.weight })));
    const paymentStatus = weightedPick(rng, [
      { value: 'unpaid', weight: 45 },
      { value: 'partial', weight: 30 },
      { value: 'paid', weight: 25 },
    ]);

    const invoiceDate = new Date(shipmentDate.getTime() - randInt(rng, 0, 5) * 86400000);

    const lineCount = randInt(rng, 3, 8);
    const lineProducts = pickMany(rng, items, lineCount);

    const linePayloads = [];
    let totalWhole = 0;
    let totalBroken = 0;
    let totalDeliveryProxy = 0;

    const highVolumeDay = i % 9 === 0;
    const lowVolumeDay = i % 11 === 0;

    for (const product of lineProducts) {
      let wholeQty = highVolumeDay ? randInt(rng, 90, 180) : randInt(rng, 22, 96);
      if (lowVolumeDay) {
        wholeQty = randInt(rng, 8, 24);
      }

      // Edge case: some lines with zero broken, some with higher broken.
      const brokenQty = i % 7 === 0
        ? 0
        : i % 13 === 0
          ? randInt(rng, 6, 18)
          : randInt(rng, 0, 6);

      const sqm = Number((wholeQty * sqmPerBox(product)).toFixed(3));
      const costPerSqm = randFloat(rng, product.baseCostPerSqm * 0.9, product.baseCostPerSqm * 1.2, 2);
      const unitCost = Number((costPerSqm * sqmPerBox(product)).toFixed(2));
      const landedCost = Number((unitCost + randFloat(rng, 6, 32, 2)).toFixed(2));

      totalWhole += wholeQty;
      totalBroken += brokenQty;
      totalDeliveryProxy += sqm * product.thicknessMm;

      linePayloads.push({
        itemId: product.id,
        hsnCode: product.hsn,
        qtySqm: sqm,
        costPerSqm,
        thicknessMmSnapshot: product.thicknessMm,
        orderedQty: wholeQty + brokenQty,
        receivedWholeQty: wholeQty,
        receivedBrokenQty: brokenQty,
        rejectedQty: randInt(rng, 0, 4),
        unitCost,
        landedCost,
      });
    }

    const deliveryCost = Number((Math.max(totalDeliveryProxy * randFloat(rng, 1.5, 2.9, 2), randFloat(rng, 5000, 22000, 2))).toFixed(2));
    const unloadingLabourCost = Number(randFloat(rng, 1200, 9800, 2).toFixed(2));

    let paidAmount = null;
    let paymentDate = null;
    let paymentReference = null;
    let paymentMode = null;

    const invoiceGrandEstimate = Number(linePayloads.reduce((sum, line) => sum + line.qtySqm * line.costPerSqm, 0).toFixed(2));

    if (paymentStatus === 'paid') {
      paidAmount = invoiceGrandEstimate;
      paymentDate = formatDateYYYYMMDD(new Date(shipmentDate.getTime() + randInt(rng, 1, 20) * 86400000));
      paymentReference = `PAY-${String(i + 1).padStart(4, '0')}-${randInt(rng, 1000, 9999)}`;
      paymentMode = pick(rng, ['NEFT', 'UPI', 'RTGS']);
    } else if (paymentStatus === 'partial') {
      paidAmount = Number((invoiceGrandEstimate * randFloat(rng, 0.25, 0.75, 2)).toFixed(2));
      paymentDate = formatDateYYYYMMDD(new Date(shipmentDate.getTime() + randInt(rng, 3, 25) * 86400000));
      paymentReference = `PART-${String(i + 1).padStart(4, '0')}-${randInt(rng, 1000, 9999)}`;
      paymentMode = pick(rng, ['NEFT', 'UPI']);
    }

    const shipmentNumber = `PUR-${new Date(shipmentDate).getUTCFullYear()}-${String(i + 1).padStart(4, '0')}`;
    const invoiceNumber = i === 0 ? '1225027237' : `INV-PUR-${String(i + 1).padStart(5, '0')}`;

    const submittedAt = new Date(shipmentDate.getTime() + randInt(rng, 0, 6) * 3600000);
    const reviewedAt = selectedStatus.approvalStatus === 'pending' ? null : new Date(submittedAt.getTime() + randInt(rng, 4, 28) * 3600000);
    const approvedAt = selectedStatus.approvalStatus === 'approved' ? new Date(reviewedAt.getTime() + randInt(rng, 1, 12) * 3600000) : null;

    const shipment = await insertInboundHeader({
      shipmentNumber,
      supplierId: supplier.id,
      transporterId: transporter.id,
      vehicleId: vehicle.id,
      truckLicensePlate: vehicle.vehicle_number,
      truckNumber: vehicle.vehicle_number,
      driverName: pick(rng, ['Naveen Singh', 'Arjun Meena', 'Rafiq Khan', 'Gopal Prajapati']),
      driverPhone: `98${randInt(rng, 100000000, 999999999)}`,
      arrivalDate: shipmentDate.toISOString(),
      submittedAt: submittedAt.toISOString(),
      submittedByUserId: maintainer.id,
      reviewedAt: reviewedAt ? reviewedAt.toISOString() : null,
      reviewedByUserId: reviewedAt ? approver.id : null,
      approvalStatus: selectedStatus.approvalStatus,
      approvalNotes: selectedStatus.approvalStatus === 'approved' ? 'Approved after stock check' : selectedStatus.approvalStatus === 'pending' ? null : 'Seeded edge-case review note',
      approvedAt: approvedAt ? approvedAt.toISOString() : null,
      approvedByUserId: approvedAt ? approver.id : null,
      invoiceNumber,
      invoiceDate: formatDateYYYYMMDD(invoiceDate),
      originCity: i === 0 ? 'Gailpur' : pick(rng, transportCities),
      destinationWarehouseName: pick(rng, warehouseNames),
      paymentStatus,
      paidAmount,
      paymentDate,
      paymentReference,
      paymentMode,
      deliveryCost,
      unloadingLabourCost,
      totalWholeQty: totalWhole,
      totalBrokenQty: totalBroken,
      status: selectedStatus.status,
      receivedDate: selectedStatus.approvalStatus === 'approved' ? approvedAt.toISOString() : null,
      receivedBy: selectedStatus.approvalStatus === 'approved' ? approver.name : null,
      recordedByUserId: maintainer.id,
      notes: i === 0
        ? 'Kajaria-based seeded invoice case with premium tiles and mixed sizes.'
        : 'Seeded purchase scenario for six-month operational spread.',
      createdBy: 'reset-seed-script',
    });

    const insertedLines = [];
    for (const line of linePayloads) {
      insertedLines.push(await insertInboundItem({
        inboundShipmentId: shipment.id,
        ...line,
        notes: 'Seeded line item',
      }));
    }

    if (selectedStatus.approvalStatus === 'approved') {
      await applyInboundApprovedStock({
        shipment,
        lines: linePayloads,
      });
    }

    if (rng() < 0.75) {
      await createInboundDocument({
        shipmentId: shipment.id,
        invoiceNumber,
        createdBy: 'reset-seed-script',
      });
    }

    created.push({ shipment, lines: linePayloads, approved: selectedStatus.approvalStatus === 'approved' });
  }

  return created;
}

async function insertOutboundHeader(payload) {
  const rows = await sql(
    `INSERT INTO stock_outbound_shipments (
       shipment_number, vehicle_id,
       customer_name, customer_phone,
       salesperson_name, salesperson_phone,
       truck_license_plate, truck_number, driver_name, driver_phone,
       gatepass_number, invoice_number,
       submitted_at, submitted_by_user_id,
       reviewed_at, reviewed_by_user_id,
       approval_status, approval_notes,
       approved_at, approved_by_user_id,
       dispatch_date, delivered_date,
       status,
       loading_labour_cost, transport_cost,
       recorded_by_user_id,
       notes, created_by
     ) VALUES (
       $1,$2,
       $3,$4,
       $5,$6,
       $7,$8,$9,$10,
       $11,$12,
       $13,$14,
       $15,$16,
       $17,$18,
       $19,$20,
       $21,$22,
       $23,
       $24,$25,
       $26,
       $27,$28
     ) RETURNING *`,
    [
      payload.shipmentNumber,
      payload.vehicleId,
      payload.customerName,
      payload.customerPhone,
      payload.salespersonName,
      payload.salespersonPhone,
      payload.truckLicensePlate,
      payload.truckNumber,
      payload.driverName,
      payload.driverPhone,
      payload.gatepassNumber,
      payload.invoiceNumber,
      payload.submittedAt,
      payload.submittedByUserId,
      payload.reviewedAt,
      payload.reviewedByUserId,
      payload.approvalStatus,
      payload.approvalNotes,
      payload.approvedAt,
      payload.approvedByUserId,
      payload.dispatchDate,
      payload.deliveredDate,
      payload.status,
      payload.loadingLabourCost,
      payload.transportCost,
      payload.recordedByUserId,
      payload.notes,
      payload.createdBy,
    ]
  );

  return rows[0];
}

async function insertOutboundItem(payload) {
  await sql(
    `INSERT INTO stock_outbound_shipment_items (
       outbound_shipment_id, item_id,
       loaded_whole_qty, loaded_broken_qty,
       delivered_whole_qty, delivered_broken_qty,
       notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      payload.outboundShipmentId,
      payload.itemId,
      payload.loadedWholeQty,
      payload.loadedBrokenQty,
      payload.deliveredWholeQty,
      payload.deliveredBrokenQty,
      payload.notes,
    ]
  );
}

async function applyOutboundApprovedStock({ shipment, lines }) {
  for (const line of lines) {
    await sql(
      `UPDATE stock_items
       SET current_whole_qty = current_whole_qty - $1,
           current_broken_qty = current_broken_qty - $2,
           updated_at = NOW()
       WHERE id = $3`,
      [line.loadedWholeQty, line.loadedBrokenQty, line.itemId]
    );

    if (line.loadedWholeQty > 0) {
      await sql(
        `INSERT INTO stock_movements (
           movement_number, movement_type, direction, item_id,
           quantity, tile_condition,
           unit_cost, labour_cost, transport_cost,
           source_type, source_id, reference_number, notes, created_by
         ) VALUES (
           $1,'sale_issue','out',$2,
           $3,'whole',
           $4,$5,$6,
           'outbound_shipment',$7,$8,$9,$10
         )`,
        [
          `MOV-${shipment.shipment_number}-${line.itemId}-W`,
          line.itemId,
          line.loadedWholeQty,
          line.unitCost,
          shipment.loading_labour_cost || 0,
          shipment.transport_cost || 0,
          shipment.id,
          shipment.invoice_number || shipment.shipment_number,
          'Seed approved dispatch whole movement',
          shipment.created_by,
        ]
      );
    }

    if (line.loadedBrokenQty > 0) {
      await sql(
        `INSERT INTO stock_movements (
           movement_number, movement_type, direction, item_id,
           quantity, tile_condition,
           unit_cost, labour_cost, transport_cost,
           source_type, source_id, reference_number, notes, created_by
         ) VALUES (
           $1,'sale_issue','out',$2,
           $3,'broken',
           $4,$5,$6,
           'outbound_shipment',$7,$8,$9,$10
         )`,
        [
          `MOV-${shipment.shipment_number}-${line.itemId}-B`,
          line.itemId,
          line.loadedBrokenQty,
          line.unitCost,
          shipment.loading_labour_cost || 0,
          shipment.transport_cost || 0,
          shipment.id,
          shipment.invoice_number || shipment.shipment_number,
          'Seed approved dispatch broken movement',
          shipment.created_by,
        ]
      );
    }
  }
}

async function createOutboundDocument({ shipmentId, invoiceNumber, createdBy }) {
  const docRows = await sql(
    `INSERT INTO stock_documents (
       document_number, document_type, entity_type, entity_id,
       file_name, file_url, mime_type, file_size_bytes, notes, created_by
     ) VALUES ($1,'sales_invoice','outbound_shipment',$2,$3,$4,'text/plain',$5,$6,$7)
     RETURNING id`,
    [
      invoiceNumber,
      shipmentId,
      `${invoiceNumber}.txt`,
      'data:text/plain;base64,U2VlZGVkIGRpc3BhdGNoIGludm9pY2U=',
      30,
      'Seeded dispatch invoice',
      createdBy,
    ]
  );

  await sql(
    `UPDATE stock_outbound_shipments
     SET invoice_document_id = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [docRows[0].id, shipmentId]
  );
}

async function getStockAvailabilityMap() {
  const rows = await sql(
    `SELECT id, current_whole_qty, current_broken_qty, COALESCE(landed_cost, purchase_price, 0) AS unit_cost
     FROM stock_items`,
    []
  );

  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.id), {
      whole: Number(row.current_whole_qty || 0),
      broken: Number(row.current_broken_qty || 0),
      unitCost: Number(row.unit_cost || 0),
    });
  }

  return map;
}

async function seedOutboundShipments({ rng, usersByRole, masters, items }) {
  const dispatchCount = 24;
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - 180);
  const endDate = new Date();

  const statuses = [
    { approvalStatus: 'approved', status: 'dispatched', weight: 45 },
    { approvalStatus: 'pending', status: 'submitted', weight: 30 },
    { approvalStatus: 'rejected', status: 'cancelled', weight: 10 },
    { approvalStatus: 'changes_requested', status: 'submitted', weight: 8 },
    { approvalStatus: 'reviewed', status: 'packed', weight: 7 },
  ];

  const availability = await getStockAvailabilityMap();
  const created = [];

  for (let i = 0; i < dispatchCount; i += 1) {
    const maintainer = pick(rng, usersByRole.stock_maintainer);
    const approver = pick(rng, [...usersByRole.admin, ...usersByRole.manager]);
    const salesperson = pick(rng, usersByRole.salesperson);
    const customer = pick(rng, masters.customers);
    const vehicle = pick(rng, masters.vehicles);

    const dispatchDate = randomDateInRange(rng, startDate, endDate);
    const selectedStatus = weightedPick(rng, statuses.map((s) => ({ value: s, weight: s.weight })));

    const lineCount = randInt(rng, 2, 6);
    const lineProducts = pickMany(rng, items, lineCount);

    const linePayloads = [];

    for (const product of lineProducts) {
      const stock = availability.get(product.id) || { whole: 0, broken: 0, unitCost: 0 };

      let loadedWhole = randInt(rng, 4, 36);
      let loadedBroken = randInt(rng, 0, 6);

      if (selectedStatus.approvalStatus === 'approved') {
        loadedWhole = Math.min(loadedWhole, Math.max(stock.whole, 0));
        loadedBroken = Math.min(loadedBroken, Math.max(stock.broken, 0));

        if (loadedWhole === 0 && loadedBroken === 0) {
          continue;
        }

        stock.whole -= loadedWhole;
        stock.broken -= loadedBroken;
        availability.set(product.id, stock);
      }

      linePayloads.push({
        itemId: product.id,
        loadedWholeQty: loadedWhole,
        loadedBrokenQty: loadedBroken,
        deliveredWholeQty: selectedStatus.approvalStatus === 'approved' ? loadedWhole : 0,
        deliveredBrokenQty: selectedStatus.approvalStatus === 'approved' ? loadedBroken : 0,
        unitCost: stock.unitCost || Number((product.baseCostPerSqm * sqmPerBox(product)).toFixed(2)),
      });
    }

    if (linePayloads.length === 0) {
      continue;
    }

    const shipmentNumber = `DSP-${new Date(dispatchDate).getUTCFullYear()}-${String(i + 1).padStart(4, '0')}`;
    const invoiceNumber = `INV-DSP-${String(i + 1).padStart(5, '0')}`;
    const submittedAt = new Date(dispatchDate.getTime() - randInt(rng, 12, 48) * 3600000);
    const reviewedAt = selectedStatus.approvalStatus === 'pending' ? null : new Date(submittedAt.getTime() + randInt(rng, 4, 24) * 3600000);
    const approvedAt = selectedStatus.approvalStatus === 'approved' ? new Date(reviewedAt.getTime() + randInt(rng, 2, 8) * 3600000) : null;

    const shipment = await insertOutboundHeader({
      shipmentNumber,
      vehicleId: vehicle.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      salespersonName: salesperson.name,
      salespersonPhone: salesperson.phone,
      truckLicensePlate: vehicle.vehicle_number,
      truckNumber: vehicle.vehicle_number,
      driverName: pick(rng, ['Naveen Singh', 'Arjun Meena', 'Rafiq Khan', 'Gopal Prajapati']),
      driverPhone: `97${randInt(rng, 100000000, 999999999)}`,
      gatepassNumber: `GP-${String(i + 1).padStart(5, '0')}`,
      invoiceNumber,
      submittedAt: submittedAt.toISOString(),
      submittedByUserId: maintainer.id,
      reviewedAt: reviewedAt ? reviewedAt.toISOString() : null,
      reviewedByUserId: reviewedAt ? approver.id : null,
      approvalStatus: selectedStatus.approvalStatus,
      approvalNotes: selectedStatus.approvalStatus === 'approved' ? 'Approved for dispatch' : selectedStatus.approvalStatus === 'pending' ? null : 'Seeded review edge case',
      approvedAt: approvedAt ? approvedAt.toISOString() : null,
      approvedByUserId: approvedAt ? approver.id : null,
      dispatchDate: dispatchDate.toISOString(),
      deliveredDate: selectedStatus.approvalStatus === 'approved' && rng() < 0.65
        ? new Date(dispatchDate.getTime() + randInt(rng, 1, 5) * 86400000).toISOString()
        : null,
      status: selectedStatus.status,
      loadingLabourCost: randFloat(rng, 900, 7800, 2),
      transportCost: randFloat(rng, 2800, 22000, 2),
      recordedByUserId: maintainer.id,
      notes: 'Seeded outbound dispatch across six-month range',
      createdBy: 'reset-seed-script',
    });

    for (const line of linePayloads) {
      await insertOutboundItem({
        outboundShipmentId: shipment.id,
        ...line,
        notes: 'Seeded dispatch line item',
      });
    }

    if (selectedStatus.approvalStatus === 'approved') {
      await applyOutboundApprovedStock({ shipment, lines: linePayloads });
    }

    if (rng() < 0.65) {
      await createOutboundDocument({
        shipmentId: shipment.id,
        invoiceNumber,
        createdBy: 'reset-seed-script',
      });
    }

    created.push({ shipment, lines: linePayloads, approved: selectedStatus.approvalStatus === 'approved' });
  }

  return created;
}

async function runVerificationReport() {
  const [
    usersByRole,
    purchasesByStatus,
    purchasesByPayment,
    dispatchesByStatus,
    docsCount,
    dateCoverage,
    inboundOrphans,
    outboundOrphans,
    negativeStock,
    inboundApprovedWithoutMovement,
    outboundApprovedWithoutMovement,
    samplePurchases,
    sampleDispatches,
  ] = await Promise.all([
    sql(`SELECT role, COUNT(*)::INTEGER AS count FROM stock_app_users GROUP BY role ORDER BY role`, []),
    sql(`SELECT status, COUNT(*)::INTEGER AS count FROM stock_inbound_shipments GROUP BY status ORDER BY status`, []),
    sql(`SELECT payment_status, COUNT(*)::INTEGER AS count FROM stock_inbound_shipments GROUP BY payment_status ORDER BY payment_status`, []),
    sql(`SELECT status, COUNT(*)::INTEGER AS count FROM stock_outbound_shipments GROUP BY status ORDER BY status`, []),
    sql(
      `SELECT entity_type, COUNT(*)::INTEGER AS count
       FROM stock_documents
       WHERE entity_type IN ('inbound_shipment', 'outbound_shipment')
       GROUP BY entity_type
       ORDER BY entity_type`,
      []
    ),
    sql(
      `SELECT
         (SELECT MIN(arrival_date) FROM stock_inbound_shipments) AS min_purchase_date,
         (SELECT MAX(arrival_date) FROM stock_inbound_shipments) AS max_purchase_date,
         (SELECT MIN(dispatch_date) FROM stock_outbound_shipments) AS min_dispatch_date,
         (SELECT MAX(dispatch_date) FROM stock_outbound_shipments) AS max_dispatch_date`,
      []
    ),
    sql(
      `SELECT COUNT(*)::INTEGER AS orphan_count
       FROM stock_inbound_shipment_items isi
       LEFT JOIN stock_inbound_shipments s ON s.id = isi.inbound_shipment_id
       WHERE s.id IS NULL`,
      []
    ),
    sql(
      `SELECT COUNT(*)::INTEGER AS orphan_count
       FROM stock_outbound_shipment_items osi
       LEFT JOIN stock_outbound_shipments s ON s.id = osi.outbound_shipment_id
       WHERE s.id IS NULL`,
      []
    ),
    sql(
      `SELECT COUNT(*)::INTEGER AS negative_count
       FROM stock_items
       WHERE current_whole_qty < 0 OR current_broken_qty < 0 OR reserved_whole_qty < 0 OR reserved_broken_qty < 0`,
      []
    ),
    sql(
      `SELECT COUNT(*)::INTEGER AS mismatch_count
       FROM stock_inbound_shipments s
       WHERE s.approval_status = 'approved'
         AND NOT EXISTS (
           SELECT 1
           FROM stock_movements m
           WHERE m.source_type = 'inbound_shipment'
             AND m.source_id = s.id
         )`,
      []
    ),
    sql(
      `SELECT COUNT(*)::INTEGER AS mismatch_count
       FROM stock_outbound_shipments s
       WHERE s.approval_status = 'approved'
         AND NOT EXISTS (
           SELECT 1
           FROM stock_movements m
           WHERE m.source_type = 'outbound_shipment'
             AND m.source_id = s.id
         )`,
      []
    ),
    sql(
      `SELECT shipment_number, invoice_number, invoice_date, origin_city, destination_warehouse_name, payment_status, total_whole_qty, total_broken_qty, status, approval_status
       FROM stock_inbound_shipments
       ORDER BY arrival_date DESC
       LIMIT 3`,
      []
    ),
    sql(
      `SELECT shipment_number, invoice_number, customer_name, salesperson_name, status, approval_status, dispatch_date
       FROM stock_outbound_shipments
       ORDER BY dispatch_date DESC
       LIMIT 3`,
      []
    ),
  ]);

  return {
    counts: {
      usersByRole,
      purchasesByStatus,
      purchasesByPaymentStatus: purchasesByPayment,
      dispatchesByStatus,
      documentsLinked: docsCount,
    },
    dateCoverage: dateCoverage[0] || {},
    integrity: {
      inboundOrphanItems: inboundOrphans[0]?.orphan_count || 0,
      outboundOrphanItems: outboundOrphans[0]?.orphan_count || 0,
      negativeStockRows: negativeStock[0]?.negative_count || 0,
      approvedPurchasesWithoutMovement: inboundApprovedWithoutMovement[0]?.mismatch_count || 0,
      approvedDispatchesWithoutMovement: outboundApprovedWithoutMovement[0]?.mismatch_count || 0,
    },
    samples: {
      purchases: samplePurchases,
      dispatches: sampleDispatches,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const currentCounts = await getCurrentCounts();

  const plan = {
    mode: args.dryRun ? 'dry-run' : 'execute',
    seed: args.seed,
    requiresConfirm: !args.dryRun,
    currentCounts,
    target: {
      users: {
        admin: 1,
        manager: 2,
        stock_maintainer: 6,
        salesperson: 8,
      },
      purchasesToCreate: 36,
      dispatchesToCreate: 24,
      dateWindowDays: 180,
    },
  };

  if (args.dryRun) {
    console.log(JSON.stringify({
      message: 'Dry run only. No data changes applied.',
      plan,
      runCommand: 'DATABASE_URL="..." npm run db:reset-seed-stock-ops -- --confirm-reset=true --seed=20260414',
    }, null, 2));
    return;
  }

  if (!args.confirmReset) {
    console.error('Refusing to run destructive reset without --confirm-reset=true');
    process.exit(1);
  }

  const rng = makeRng(args.seed);

  await runResetTransaction();

  // Seed reference dimensions for divisions used by users/items.
  for (const divisionName of ['Marble', 'Granite', 'Designer', 'Porcelain', 'Operations', 'Commercial', 'Control']) {
    await ensureDivision(divisionName);
  }

  const { users, byRole } = await upsertUsersAndGetMaps();
  const masters = await ensureMasters();
  const items = await ensureItems(makeProductCatalog());

  const seededPurchases = await seedInboundShipments({ rng, usersByRole: byRole, masters, items });
  const seededDispatches = await seedOutboundShipments({ rng, usersByRole: byRole, masters, items });

  const report = await runVerificationReport();

  console.log(JSON.stringify({
    message: 'Reset and seed completed successfully.',
    seed: args.seed,
    usersSeededReference: users.length,
    purchasesCreated: seededPurchases.length,
    dispatchesCreated: seededDispatches.length,
    report,
  }, null, 2));
}

main().catch((error) => {
  console.error('reset-and-seed failed:', error);
  process.exit(1);
});
