#!/usr/bin/env node

/**
 * Stock Management Database Fresh Seed Script
 * 
 * This script TRUNCATES all existing data and seeds from scratch
 * with proper dependency ordering to avoid conflicts.
 * 
 * Run with: node scripts/fresh-seed.js
 * Required: DATABASE_URL environment variable
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Utility functions
function getDateInMonth(dayOffset) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = new Date(year, month, Math.min(dayOffset, 28));
  return date;
}

function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

async function freshSeedDatabase() {
  console.log('🗑️  Starting fresh database seed...\n');

  try {
    // ===== DELETE ALL DATA IN REVERSE ORDER =====
    console.log('🧹 Cleaning up existing data...');
    
    // Delete in dependency order (leaf tables first)  
    try {
      console.log('  Deleting records from all tables...');
      await sql`DELETE FROM stock_notifications`;
      await sql`DELETE FROM stock_timeline_events`;
      await sql`DELETE FROM stock_audit_logs`;
      await sql`DELETE FROM stock_change_requests`;
      await sql`DELETE FROM stock_customer_acknowledgements`;
      await sql`DELETE FROM stock_cost_entries`;
      await sql`DELETE FROM stock_documents`;
      await sql`DELETE FROM stock_movements`;
      await sql`DELETE FROM stock_inventory_lots`;
      await sql`DELETE FROM stock_outbound_shipment_items`;
      await sql`DELETE FROM stock_outbound_shipments`;
      await sql`DELETE FROM stock_sales_order_items`;
      await sql`DELETE FROM stock_sales_orders`;
      await sql`DELETE FROM stock_inbound_shipment_items`;
      await sql`DELETE FROM stock_inbound_shipments`;
      await sql`DELETE FROM stock_purchase_order_items`;
      await sql`DELETE FROM stock_purchase_orders`;
      await sql`DELETE FROM stock_items`;
      await sql`DELETE FROM stock_app_users`;
      await sql`DELETE FROM stock_sales_people`;
      await sql`DELETE FROM stock_vehicles`;
      await sql`DELETE FROM stock_transporters`;
      await sql`DELETE FROM stock_customers`;
      await sql`DELETE FROM stock_suppliers`;
      await sql`DELETE FROM stock_locations`;
      await sql`DELETE FROM stock_sizes`;
      await sql`DELETE FROM stock_types`;
      await sql`DELETE FROM stock_brands`;
      console.log('  ✓ All records deleted');
    } catch (err) {
      if (err.code !== '42P01') {
        console.log(`  ⚠️  Some cleanup errors (tables may have dependencies): ${err.message}`);
      }
    }

    console.log('✅ Tables cleaned\n');

    // ===== FIX ROLE CONSTRAINT =====
    console.log('🔧 Setting up role constraint...');
    try {
      // First, drop the old constraint if it exists
      await sql`ALTER TABLE stock_app_users DROP CONSTRAINT IF EXISTS stock_app_users_role_check`;
      // Add the correct constraint
      await sql`ALTER TABLE stock_app_users ADD CONSTRAINT stock_app_users_role_check CHECK (role IN ('admin', 'manager', 'stock_maintainer'))`;
      console.log('  ✓ Role constraint fixed');
    } catch (err) {
      console.log(`  ⚠️  Role constraint setup: ${err.message}`);
    }
    console.log('✅ Constraints ready\n');

    // ===== SEED MASTER DATA (No dependencies) =====
    console.log('📋 Seeding master data...');

    const brands = [
      { name: 'Kajaria', name_hi: 'काजरिया', description: 'Premium Indian tile brand' },
      { name: 'Somany', name_hi: 'सोमनी', description: 'Leading tile manufacturer' },
      { name: 'Brillant', name_hi: 'ब्रिलिएंट', description: 'Quality marble tiles' },
      { name: 'Nitco', name_hi: 'नित्को', description: 'Premium vitrified tiles' },
      { name: 'Rak Ceramics', name_hi: 'राक सिरामिक्स', description: 'International quality' },
    ];

    const brandIds = [];
    for (const brand of brands) {
      const result = await sql`
        INSERT INTO stock_brands (name, name_hi, description)
        VALUES (${brand.name}, ${brand.name_hi}, ${brand.description})
        RETURNING id
      `;
      brandIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${brandIds.length} brands`);

    const types = [
      { name: 'Vitrified', name_hi: 'विट्रिफाइड' },
      { name: 'Marble', name_hi: 'मार्बल' },
      { name: 'Granite', name_hi: 'ग्रेनाइट' },
      { name: 'Ceramic', name_hi: 'सिरेमिक' },
      { name: 'Porcelain', name_hi: 'पोर्सिलेन' },
    ];

    const typeIds = [];
    for (const type of types) {
      const result = await sql`
        INSERT INTO stock_types (name, name_hi)
        VALUES (${type.name}, ${type.name_hi})
        RETURNING id
      `;
      typeIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${typeIds.length} types`);

    const sizes = [
      { label: '600x600', width_mm: 600, length_mm: 600, thickness_mm: 20 },
      { label: '800x800', width_mm: 800, length_mm: 800, thickness_mm: 20 },
      { label: '1200x600', width_mm: 1200, length_mm: 600, thickness_mm: 20 },
      { label: '300x600', width_mm: 300, length_mm: 600, thickness_mm: 10 },
    ];

    const sizeIds = [];
    for (const size of sizes) {
      const result = await sql`
        INSERT INTO stock_sizes (label, width_mm, length_mm, thickness_mm)
        VALUES (${size.label}, ${size.width_mm}, ${size.length_mm}, ${size.thickness_mm})
        RETURNING id
      `;
      sizeIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${sizeIds.length} sizes`);

    const locations = [
      { name: 'Main Warehouse', location_type: 'warehouse', address: 'Industrial Area' },
      { name: 'Showroom', location_type: 'showroom', address: 'Delhi' },
      { name: 'Yard', location_type: 'yard', address: 'Outside' },
      { name: 'In Transit', location_type: 'in_transit', address: 'Various' },
    ];

    const locationIds = [];
    for (const loc of locations) {
      const result = await sql`
        INSERT INTO stock_locations (name, location_type, address)
        VALUES (${loc.name}, ${loc.location_type}, ${loc.address})
        RETURNING id
      `;
      locationIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${locationIds.length} locations`);

    const suppliers = [
      { name: 'Kajaria Delhi', gst_number: '07AABCU1234F1Z0', phone: '9876543220', email: 'kajaria@supplier.com', address: 'Noida' },
      { name: 'Somany Mumbai', gst_number: '27AABCS1234F1Z0', phone: '9876543221', email: 'somany@supplier.com', address: 'Mumbai' },
      { name: 'Brillant Tiles', gst_number: '07AABCTS1234F1Z0', phone: '9876543222', email: 'brillant@supplier.com', address: 'Delhi' },
      { name: 'Premium Imports', gst_number: '07AABCU2234F1Z0', phone: '9876543223', email: 'premium@supplier.com', address: 'Bangalore' },
    ];

    const supplierIds = [];
    for (const supplier of suppliers) {
      const result = await sql`
        INSERT INTO stock_suppliers (name, gst_number, phone, email, address)
        VALUES (${supplier.name}, ${supplier.gst_number}, ${supplier.phone}, ${supplier.email}, ${supplier.address})
        RETURNING id
      `;
      supplierIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${supplierIds.length} suppliers`);

    const customers = [
      { name: 'John Contractor', phone: '8765432100', whatsapp_phone: '8765432100', email: 'john@contractor.com', company_name: 'John Constructions' },
      { name: 'Priya Interiors', phone: '8765432101', whatsapp_phone: '8765432101', email: 'priya@interiors.com', company_name: 'Priya Interiors' },
      { name: 'Builder Hub', phone: '8765432102', whatsapp_phone: '8765432102', email: 'builders@hub.com', company_name: 'Builder Hub' },
      { name: 'Retail A', phone: '8765432103', whatsapp_phone: '8765432103', email: 'retail@outlet.com', company_name: 'Retail Outlet' },
    ];

    const customerIds = [];
    for (const customer of customers) {
      const result = await sql`
        INSERT INTO stock_customers (name, phone, whatsapp_phone, email, company_name)
        VALUES (${customer.name}, ${customer.phone}, ${customer.whatsapp_phone}, ${customer.email}, ${customer.company_name})
        RETURNING id
      `;
      customerIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${customerIds.length} customers`);

    const transporters = [
      { name: 'Fast Logistics', contact_name: 'Ravi', phone: '7654321000', gst_number: '07AABCT1234F1Z0', address: 'Delhi' },
      { name: 'Express Haulers', contact_name: 'Vikram', phone: '7654321001', gst_number: '07AABCT2234F1Z0', address: 'Noida' },
      { name: 'Premium Transport', contact_name: 'Amit', phone: '7654321002', gst_number: '07AABCT3234F1Z0', address: 'Gurgaon' },
    ];

    const transporterIds = [];
    for (const transporter of transporters) {
      const result = await sql`
        INSERT INTO stock_transporters (name, contact_name, phone, gst_number, address)
        VALUES (${transporter.name}, ${transporter.contact_name}, ${transporter.phone}, ${transporter.gst_number}, ${transporter.address})
        RETURNING id
      `;
      transporterIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${transporterIds.length} transporters`);

    const vehicles = [
      { vehicle_number: 'DL01AB1234', vehicle_type: 'Truck', driver_name: 'Harish', driver_phone: '9876543300', transporter_id: transporterIds[0] },
      { vehicle_number: 'UP14MN5678', vehicle_type: 'Truck', driver_name: 'Sanjay', driver_phone: '9876543301', transporter_id: transporterIds[1] },
      { vehicle_number: 'HR26PH9012', vehicle_type: 'Truck', driver_name: 'Mohit', driver_phone: '9876543302', transporter_id: transporterIds[2] },
    ];

    const vehicleIds = [];
    for (const vehicle of vehicles) {
      const result = await sql`
        INSERT INTO stock_vehicles (vehicle_number, vehicle_type, driver_name, driver_phone, transporter_id)
        VALUES (${vehicle.vehicle_number}, ${vehicle.vehicle_type}, ${vehicle.driver_name}, ${vehicle.driver_phone}, ${vehicle.transporter_id})
        RETURNING id
      `;
      vehicleIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${vehicleIds.length} vehicles`);

    const salesPeople = [
      { name: 'Rajesh Kumar', phone: '9876543400', email: 'rajesh@sales.com', whatsapp_phone: '9876543400' },
      { name: 'Deepika Singh', phone: '9876543401', email: 'deepika@sales.com', whatsapp_phone: '9876543401' },
      { name: 'Arjun Patel', phone: '9876543402', email: 'arjun@sales.com', whatsapp_phone: '9876543402' },
    ];

    const salesPeopleIds = [];
    for (const person of salesPeople) {
      const result = await sql`
        INSERT INTO stock_sales_people (name, phone, email, whatsapp_phone)
        VALUES (${person.name}, ${person.phone}, ${person.email}, ${person.whatsapp_phone})
        RETURNING id
      `;
      salesPeopleIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${salesPeopleIds.length} sales people`);

    console.log('✅ Master data seeded\n');

    // ===== SEED USERS =====
    console.log('👥 Seeding users...');

    const users = [
      { name: 'Admin User', phone: '9111111111', email: 'admin@stock.com', role: 'admin', status: 'active' },
      { name: 'Manager One', phone: '9222222221', email: 'manager1@stock.com', role: 'manager', status: 'active' },
      { name: 'Manager Two', phone: '9222222222', email: 'manager2@stock.com', role: 'manager', status: 'active' },
      { name: 'Stock Maintainer A', phone: '9333333331', email: 'maintainer1@stock.com', role: 'stock_maintainer', status: 'active' },
      { name: 'Stock Maintainer B', phone: '9333333332', email: 'maintainer2@stock.com', role: 'stock_maintainer', status: 'active' },
    ];

    const userIds = [];
    for (const user of users) {
      const result = await sql`
        INSERT INTO stock_app_users (name, phone, email, role, status)
        VALUES (${user.name}, ${user.phone}, ${user.email}, ${user.role}, ${user.status})
        RETURNING id
      `;
      userIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${userIds.length} users`);
    console.log('✅ Users seeded\n');

    // ===== SEED STOCK ITEMS =====
    console.log('📦 Seeding stock items...');

    const items = [
      { sku: 'KAJ-600-WHT-001', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[0], name: 'Kajaria White 600x600', tiles_per_box: 4, purchase_price: 450, selling_price: 599 },
      { sku: 'KAJ-800-BLK-001', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[1], name: 'Kajaria Black 800x800', tiles_per_box: 2, purchase_price: 850, selling_price: 1199 },
      { sku: 'SOM-600-GRY-001', brand_id: brandIds[1], type_id: typeIds[0], size_id: sizeIds[0], name: 'Somany Grey 600x600', tiles_per_box: 4, purchase_price: 400, selling_price: 549 },
      { sku: 'BRL-MBL-CRM-001', brand_id: brandIds[2], type_id: typeIds[1], size_id: sizeIds[2], name: 'Brillant Marble Cream', tiles_per_box: 2, purchase_price: 1200, selling_price: 1799 },
      { sku: 'NIT-GRN-300-001', brand_id: brandIds[3], type_id: typeIds[0], size_id: sizeIds[3], name: 'Nitco Green 300x600', tiles_per_box: 8, purchase_price: 180, selling_price: 299 },
      { sku: 'RAK-GOLD-001', brand_id: brandIds[4], type_id: typeIds[2], size_id: sizeIds[0], name: 'Rak Granite Gold', tiles_per_box: 4, purchase_price: 650, selling_price: 899 },
    ];

    const itemIds = [];
    for (const item of items) {
      const result = await sql`
        INSERT INTO stock_items (
          sku, brand_id, type_id, size_id, name, tiles_per_box,
          purchase_price, selling_price, reorder_level
        ) VALUES (
          ${item.sku}, ${item.brand_id}, ${item.type_id}, ${item.size_id}, ${item.name},
          ${item.tiles_per_box}, ${item.purchase_price}, ${item.selling_price}, 20
        )
        RETURNING id
      `;
      itemIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${itemIds.length} stock items`);
    console.log('✅ Stock items seeded\n');

    // ===== SEED PURCHASE ORDERS & INBOUND SHIPMENTS =====
    console.log('📥 Seeding inbound shipments...');

    const inboundScenarios = [
      {
        po_number: 'PO-2026-001',
        supplier_id: supplierIds[0],
        status: 'received',
        total_amount: 45000,
        shipment_number: 'INBOUND-2026-001',
        approval_status: 'approved',
        arrival_days_ago: 5,
        items: [{ item_id: itemIds[0], ordered_qty: 100, received_whole: 95, received_broken: 5 }],
      },
      {
        po_number: 'PO-2026-002',
        supplier_id: supplierIds[1],
        status: 'received',
        total_amount: 38500,
        shipment_number: 'INBOUND-2026-002',
        approval_status: 'approved',
        arrival_days_ago: 3,
        items: [{ item_id: itemIds[1], ordered_qty: 50, received_whole: 50, received_broken: 0 }],
      },
      {
        po_number: 'PO-2026-003',
        supplier_id: supplierIds[2],
        status: 'received',
        total_amount: 52300,
        shipment_number: 'INBOUND-2026-003',
        approval_status: 'pending',
        arrival_days_ago: 1,
        items: [{ item_id: itemIds[2], ordered_qty: 80, received_whole: 75, received_broken: 5 }],
      },
      {
        po_number: 'PO-2026-004',
        supplier_id: supplierIds[0],
        status: 'received',
        total_amount: 35000,
        shipment_number: 'INBOUND-2026-004',
        approval_status: 'changes_requested',
        arrival_days_ago: 2,
        items: [{ item_id: itemIds[3], ordered_qty: 40, received_whole: 35, received_broken: 5 }],
      },
      {
        po_number: 'PO-2026-005',
        supplier_id: supplierIds[1],
        status: 'received',
        total_amount: 42000,
        shipment_number: 'INBOUND-2026-005',
        approval_status: 'approved',
        arrival_days_ago: 1,
        items: [{ item_id: itemIds[4], ordered_qty: 120, received_whole: 120, received_broken: 0 }],
      },
      {
        po_number: 'PO-2026-006',
        supplier_id: supplierIds[3],
        status: 'received',
        total_amount: 38000,
        shipment_number: 'INBOUND-2026-006',
        approval_status: 'reviewed',
        arrival_days_ago: 0, // today
        items: [{ item_id: itemIds[5], ordered_qty: 60, received_whole: 58, received_broken: 2 }],
      },
    ];

    let inboundCount = 0;

    for (const scenario of inboundScenarios) {
      // Create PO
      const poResult = await sql`
        INSERT INTO stock_purchase_orders (
          po_number, supplier_id, status, total_amount, created_by
        ) VALUES (
          ${scenario.po_number}, ${scenario.supplier_id}, ${scenario.status},
          ${scenario.total_amount}, 'fresh-seed'
        )
        RETURNING id
      `;
      const poId = poResult[0].id;

      // Calculate dates
      const arrivalDate = getDateInMonth(28 - scenario.arrival_days_ago);
      const submittedDate = arrivalDate;
      const reviewedDate = scenario.approval_status !== 'pending' ? addHours(submittedDate, 2) : null;
      const approvedDate = scenario.approval_status === 'approved' ? addHours(reviewedDate || submittedDate, 1) : null;

      // Create inbound shipment
      const inboundResult = await sql`
        INSERT INTO stock_inbound_shipments (
          shipment_number, purchase_order_id, supplier_id, transporter_id, vehicle_id,
          truck_license_plate, driver_name, driver_phone,
          arrival_date, submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id,
          approval_status, approved_at, approved_by_user_id,
          status, total_whole_qty, total_broken_qty, created_by
        ) VALUES (
          ${scenario.shipment_number}, ${poId}, ${scenario.supplier_id},
          ${transporterIds[0]}, ${vehicleIds[0]},
          'TRK-001', 'Driver Name', '9876543350',
          ${arrivalDate}, ${submittedDate}, ${userIds[3]},
          ${reviewedDate}, ${userIds[1]},
          ${scenario.approval_status}, ${approvedDate}, ${userIds[0]},
          'received',
          ${scenario.items.reduce((sum, i) => sum + i.received_whole, 0)},
          ${scenario.items.reduce((sum, i) => sum + i.received_broken, 0)},
          'fresh-seed'
        )
        RETURNING id
      `;
      const inboundId = inboundResult[0].id;
      inboundCount++;

      // Create inbound items
      for (const item of scenario.items) {
        await sql`
          INSERT INTO stock_inbound_shipment_items (
            inbound_shipment_id, item_id, ordered_qty, received_whole_qty, received_broken_qty, unit_cost
          ) VALUES (
            ${inboundId}, ${item.item_id}, ${item.ordered_qty},
            ${item.received_whole}, ${item.received_broken}, 500
          )
        `;
      }
    }

    console.log(`  ✓ Created ${inboundCount} inbound shipments`);
    console.log('✅ Inbound shipments seeded\n');

    // ===== SEED OUTBOUND SHIPMENTS =====
    console.log('📤 Seeding outbound shipments...');

    const outboundScenarios = [
      {
        order_number: 'SO-2026-001',
        customer_id: customerIds[0],
        status: 'dispatched',
        total_amount: 25000,
        shipment_number: 'OUTBOUND-2026-001',
        approval_status: 'approved',
        dispatch_days_ago: 4,
        items: [{ item_id: itemIds[0], loaded_whole: 50, loaded_broken: 0 }],
      },
      {
        order_number: 'SO-2026-002',
        customer_id: customerIds[1],
        status: 'dispatched',
        total_amount: 30000,
        shipment_number: 'OUTBOUND-2026-002',
        approval_status: 'approved',
        dispatch_days_ago: 2,
        items: [{ item_id: itemIds[1], loaded_whole: 40, loaded_broken: 0 }],
      },
      {
        order_number: 'SO-2026-003',
        customer_id: customerIds[2],
        status: 'picked',
        total_amount: 28000,
        shipment_number: 'OUTBOUND-2026-003',
        approval_status: 'pending',
        dispatch_days_ago: 0, // today
        items: [{ item_id: itemIds[2], loaded_whole: 80, loaded_broken: 0 }],
      },
      {
        order_number: 'SO-2026-004',
        customer_id: customerIds[3],
        status: 'picked',
        total_amount: 22000,
        shipment_number: 'OUTBOUND-2026-004',
        approval_status: 'changes_requested',
        dispatch_days_ago: 0,
        items: [{ item_id: itemIds[3], loaded_whole: 35, loaded_broken: 0 }],
      },
      {
        order_number: 'SO-2026-005',
        customer_id: customerIds[0],
        status: 'dispatched',
        total_amount: 32000,
        shipment_number: 'OUTBOUND-2026-005',
        approval_status: 'approved',
        dispatch_days_ago: 1,
        items: [{ item_id: itemIds[4], loaded_whole: 100, loaded_broken: 0 }],
      },
    ];

    let outboundCount = 0;

    for (const scenario of outboundScenarios) {
      // Create SO
      const soResult = await sql`
        INSERT INTO stock_sales_orders (
          order_number, customer_id, status, total_amount, created_by
        ) VALUES (
          ${scenario.order_number}, ${scenario.customer_id}, ${scenario.status},
          ${scenario.total_amount}, 'fresh-seed'
        )
        RETURNING id
      `;
      const soId = soResult[0].id;

      // Calculate dates
      const dispatchDate = getDateInMonth(28 - scenario.dispatch_days_ago);
      const submittedDate = dispatchDate;
      const reviewedDate = scenario.approval_status !== 'pending' ? addHours(submittedDate, 1) : null;
      const approvedDate = scenario.approval_status === 'approved' ? addHours(reviewedDate || submittedDate, 1) : null;

      // Create outbound shipment
      const outboundResult = await sql`
        INSERT INTO stock_outbound_shipments (
          shipment_number, sales_order_id, vehicle_id, customer_name, customer_phone,
          truck_license_plate, driver_name, driver_phone,
          submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id,
          approval_status, approved_at, approved_by_user_id,
          dispatch_date, status, created_by
        ) VALUES (
          ${scenario.shipment_number}, ${soId}, ${vehicleIds[0]},
          'Customer', '9876543360', 'TRK-002', 'Driver', '9876543361',
          ${submittedDate}, ${userIds[3]},
          ${reviewedDate}, ${userIds[1]},
          ${scenario.approval_status}, ${approvedDate}, ${userIds[0]},
          ${dispatchDate}, 'dispatched', 'fresh-seed'
        )
        RETURNING id
      `;
      const outboundId = outboundResult[0].id;
      outboundCount++;

      // Create outbound items
      for (const item of scenario.items) {
        await sql`
          INSERT INTO stock_outbound_shipment_items (
            outbound_shipment_id, item_id, loaded_whole_qty, loaded_broken_qty
          ) VALUES (
            ${outboundId}, ${item.item_id}, ${item.loaded_whole}, ${item.loaded_broken}
          )
        `;
      }
    }

    console.log(`  ✓ Created ${outboundCount} outbound shipments`);
    console.log('✅ Outbound shipments seeded\n');

    // ===== SEED CHANGE REQUESTS =====
    console.log('🔄 Seeding change requests...');

    const changeRequests = [
      {
        request_number: 'CR-001',
        source_entity_type: 'inbound_shipment',
        source_entity_id: 4,
        request_type: 'correct',
        status: 'pending',
        reason: 'Verify broken qty count',
        priority: 'high',
        requested_by: userIds[3],
        requested_by_name: 'Stock Maintainer A',
      },
      {
        request_number: 'CR-002',
        source_entity_type: 'outbound_shipment',
        source_entity_id: 4,
        request_type: 'update',
        status: 'approved',
        reason: 'Add delivery confirmation',
        priority: 'normal',
        requested_by: userIds[3],
        requested_by_name: 'Stock Maintainer A',
        reviewed_by: userIds[1],
        approved_by: userIds[0],
      },
    ];

    let crCount = 0;
    for (const cr of changeRequests) {
      await sql`
        INSERT INTO stock_change_requests (
          request_number, source_entity_type, source_entity_id, request_type, status,
          reason, priority, requested_by_user_id, requested_by_name,
          reviewed_by_user_id, approved_by_user_id
        ) VALUES (
          ${cr.request_number}, ${cr.source_entity_type}, ${cr.source_entity_id},
          ${cr.request_type}, ${cr.status}, ${cr.reason}, ${cr.priority},
          ${cr.requested_by}, ${cr.requested_by_name},
          ${cr.reviewed_by || null}, ${cr.approved_by || null}
        )
      `;
      crCount++;
    }

    console.log(`  ✓ Created ${crCount} change requests`);
    console.log('✅ Change requests seeded\n');

    // ===== SEED TIMELINE EVENTS =====
    console.log('📊 Seeding timeline events...');

    const events = [
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-001 submitted', entity_id: 1, by: userIds[3] },
      { type: 'inbound_reviewed', summary: 'Inbound INBOUND-2026-001 reviewed', entity_id: 1, by: userIds[1] },
      { type: 'inbound_approved', summary: 'Inbound INBOUND-2026-001 approved', entity_id: 1, by: userIds[0] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-002 submitted', entity_id: 2, by: userIds[3] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-003 submitted', entity_id: 3, by: userIds[3] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-004 submitted', entity_id: 4, by: userIds[3] },
      { type: 'change_requested', summary: 'Changes requested CR-001', entity_id: 4, by: userIds[1] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-005 submitted', entity_id: 5, by: userIds[3] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-006 submitted', entity_id: 6, by: userIds[3] },
      { type: 'outbound_submitted', summary: 'Outbound OUTBOUND-2026-001 submitted', entity_id: 1, by: userIds[3] },
      { type: 'outbound_approved', summary: 'Outbound OUTBOUND-2026-001 approved', entity_id: 1, by: userIds[0] },
      { type: 'outbound_dispatched', summary: 'Outbound OUTBOUND-2026-001 dispatched', entity_id: 1, by: userIds[3] },
      { type: 'outbound_submitted', summary: 'Outbound OUTBOUND-2026-002 submitted', entity_id: 2, by: userIds[3] },
      { type: 'outbound_submitted', summary: 'Outbound OUTBOUND-2026-003 submitted', entity_id: 3, by: userIds[3] },
    ];

    let eventCount = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      await sql`
        INSERT INTO stock_timeline_events (
          event_number, event_type, entity_type, entity_id, recorded_by_user_id, summary
        ) VALUES (
          ${'EVT-' + String(i + 1).padStart(4, '0')},
          ${event.type}, 'shipment', ${event.entity_id}, ${event.by}, ${event.summary}
        )
      `;
      eventCount++;
    }

    console.log(`  ✓ Created ${eventCount} timeline events`);
    console.log('✅ Timeline events seeded\n');

    // ===== FINAL SUMMARY =====
    console.log('✨ Fresh seeding completed successfully! ✨\n');

    // Get counts from database
    const brandCount = await sql`SELECT COUNT(*) as count FROM stock_brands`;
    const userCount = await sql`SELECT COUNT(*) as count FROM stock_app_users`;
    const itemCount = await sql`SELECT COUNT(*) as count FROM stock_items`;
    const inboudCount = await sql`SELECT COUNT(*) as count FROM stock_inbound_shipments`;
    const outboundCount2 = await sql`SELECT COUNT(*) as count FROM stock_outbound_shipments`;

    console.log('📊 Database Content Summary:');
    console.log(`   • Brands: ${brandCount[0].count}`);
    console.log(`   • Users: ${userCount[0].count} (1 admin, 2 manager, 2 maintainer)`);
    console.log(`   • Stock Items: ${itemCount[0].count}`);
    console.log(`   • Inbound Shipments: ${inboudCount[0].count}`);
    console.log(`      - Approved: 3`);
    console.log(`      - Pending: 1`);
    console.log(`      - Changes Required: 1`);
    console.log(`      - Reviewed: 1`);
    console.log(`   • Outbound Shipments: ${outboundCount2[0].count}`);
    console.log(`      - Approved: 3`);
    console.log(`      - Pending: 1`);
    console.log(`      - Changes Required: 1`);
    console.log(`   • Change Requests: ${crCount}`);
    console.log(`   • Timeline Events: ${eventCount}\n`);

    console.log('🎯 Ready for testing!');
    console.log('   Start dev server: npm run dev');
    console.log('   Test credentials: admin@stock.com (full access)');
    console.log('   Dashboard: http://localhost:3000/stock/approvals\n');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

freshSeedDatabase();
