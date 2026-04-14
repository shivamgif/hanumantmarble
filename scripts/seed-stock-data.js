#!/usr/bin/env node

/**
 * Stock Management Database Seed Script
 * 
 * This script seeds the stock database with comprehensive test data including:
 * - Master data (brands, types, sizes, locations, suppliers, customers, transporters)
 * - Users with different roles (admin, manager, stock_maintainer, salesperson)
 * - Stock items (marble/tile products)
 * - Purchase orders and inbound shipments with various statuses
 * - Sales orders and outbound shipments
 * - Inventory movements and lots
 * - Change requests and timeline events for visualization
 * 
 * Run with: node scripts/seed-stock-data.js
 * Required: DATABASE_URL environment variable
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.log('\nAdd it to your .env.local file:');
  console.log('DATABASE_URL=your_neon_connection_string\n');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Utility to generate dates throughout the current month
function getDateInMonth(dayOffset) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  return new Date(year, month, Math.min(dayOffset, 28)); // Safe for all months
}

// Utility to add hours to a date
function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

async function seedStockDatabase() {
  console.log('🌱 Starting stock database seeding...\n');

  try {
    // ===== FIX ROLE CONSTRAINT FIRST =====
    console.log('🔧 Fixing role constraint to allow current 4-role model...');
    try {
      await sql`
        DO $$
        DECLARE
          role_constraint_name TEXT;
        BEGIN
          SELECT c.conname
          INTO role_constraint_name
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'stock_app_users'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%role IN%'
          LIMIT 1;

          IF role_constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE stock_app_users DROP CONSTRAINT %I', role_constraint_name);
          END IF;

          UPDATE stock_app_users
          SET role = CASE
            WHEN role = 'admin' THEN 'admin'
            WHEN role IN ('manager', 'stock_approver') THEN 'manager'
            WHEN role IN ('salesperson', 'sales_person', 'sales') THEN 'salesperson'
            ELSE 'stock_maintainer'
          END;

          UPDATE stock_app_users
          SET can_manage_users = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
              can_approve_changes = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
              can_view_dashboard = COALESCE(can_view_dashboard, TRUE);

          ALTER TABLE stock_app_users
          ADD CONSTRAINT stock_app_users_role_check
          CHECK (role IN ('admin', 'manager', 'stock_maintainer', 'salesperson'));
        END $$;
      `;
      console.log('✅ Role constraint fixed\n');
    } catch (err) {
      console.log('⏭️  Role constraint already correct, continuing...\n');
    }
    // ===== SEED MASTER DATA =====
    console.log('📋 Seeding master data...');

    // Brands
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
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
      `;
      if (result.length > 0) brandIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${brandIds.length} brands`);

    // Types
    const types = [
      { name: 'Vitrified', name_hi: 'विट्रिफाइड', description: 'Vitrified tiles' },
      { name: 'Marble', name_hi: 'मार्बल', description: 'Natural marble' },
      { name: 'Granite', name_hi: 'ग्रेनाइट', description: 'Granite tiles' },
      { name: 'Ceramic', name_hi: 'सिरेमिक', description: 'Ceramic tiles' },
      { name: 'Porcelain', name_hi: 'पोर्सिलेन', description: 'Porcelain tiles' },
    ];

    const typeIds = [];
    for (const type of types) {
      const result = await sql`
        INSERT INTO stock_types (name, name_hi, description)
        VALUES (${type.name}, ${type.name_hi}, ${type.description})
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
      `;
      if (result.length > 0) typeIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${typeIds.length} types`);

    // Sizes
    const sizes = [
      { label: '600x600', width_mm: 600, length_mm: 600, thickness_mm: 20 },
      { label: '800x800', width_mm: 800, length_mm: 800, thickness_mm: 20 },
      { label: '1200x600', width_mm: 1200, length_mm: 600, thickness_mm: 20 },
      { label: '300x600', width_mm: 300, length_mm: 600, thickness_mm: 10 },
      { label: '600x1200', width_mm: 600, length_mm: 1200, thickness_mm: 20 },
    ];

    const sizeIds = [];
    for (const size of sizes) {
      const result = await sql`
        INSERT INTO stock_sizes (label, width_mm, length_mm, thickness_mm)
        VALUES (${size.label}, ${size.width_mm}, ${size.length_mm}, ${size.thickness_mm})
        ON CONFLICT (label) DO UPDATE SET thickness_mm = EXCLUDED.thickness_mm
        RETURNING id
      `;
      if (result.length > 0) sizeIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${sizeIds.length} sizes`);

    // Locations
    const locations = [
      { name: 'Main Warehouse', location_type: 'warehouse', address: 'Industrial Area, Delhi', contact_name: 'Rajesh', contact_phone: '9876543210' },
      { name: 'Showroom Delhi', location_type: 'showroom', address: 'Connaught Place, Delhi', contact_name: 'Priya', contact_phone: '9876543211' },
      { name: 'Yard 1', location_type: 'yard', address: 'Outside Delhi', contact_name: 'Kumar', contact_phone: '9876543212' },
      { name: 'In Transit', location_type: 'in_transit', address: 'Various', contact_name: 'Driver', contact_phone: 'N/A' },
      { name: 'Customer Site A', location_type: 'customer_site', address: 'Gurgaon', contact_name: 'Customer', contact_phone: '9876543213' },
    ];

    const locationIds = [];
    for (const loc of locations) {
      const result = await sql`
        INSERT INTO stock_locations (name, location_type, address, contact_name, contact_phone)
        VALUES (${loc.name}, ${loc.location_type}, ${loc.address}, ${loc.contact_name}, ${loc.contact_phone})
        ON CONFLICT (name) DO UPDATE SET address = EXCLUDED.address
        RETURNING id
      `;
      if (result.length > 0) locationIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${locationIds.length} locations`);

    // Suppliers
    const suppliers = [
      { name: 'Kajaria Distributor', gst_number: '07AABCU1234F1Z0', phone: '9876543220', email: 'kajaria@supplier.com', address: 'Noida, UP' },
      { name: 'Somany Supplier', gst_number: '27AABCS1234F1Z0', phone: '9876543221', email: 'somany@supplier.com', address: 'Mumbai, MH' },
      { name: 'Brillant Tiles', gst_number: '07AABCTS1234F1Z0', phone: '9876543222', email: 'brillant@supplier.com', address: 'Delhi' },
      { name: 'Premium Imports', gst_number: '07AABCU2234F1Z0', phone: '9876543223', email: 'premium@supplier.com', address: 'Bangalore, KA' },
    ];

    const supplierIds = [];
    for (const supplier of suppliers) {
      const result = await sql`
        INSERT INTO stock_suppliers (name, gst_number, phone, email, address)
        VALUES (${supplier.name}, ${supplier.gst_number}, ${supplier.phone}, ${supplier.email}, ${supplier.address})
        ON CONFLICT (name) DO UPDATE SET gst_number = EXCLUDED.gst_number
        RETURNING id
      `;
      if (result.length > 0) supplierIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${supplierIds.length} suppliers`);

    // Customers
    const customers = [
      { name: 'John Contractor', phone: '8765432100', whatsapp_phone: '8765432100', email: 'john@contractor.com', company_name: 'John Constructions', billing_address: 'Delhi', gst_number: '07AABCU3234F1Z0' },
      { name: 'Priya Interiors', phone: '8765432101', whatsapp_phone: '8765432101', email: 'priya@interiors.com', company_name: 'Priya Interiors', billing_address: 'Gurgaon', gst_number: '07AABCU4234F1Z0' },
      { name: 'Builder\'s Hub', phone: '8765432102', whatsapp_phone: '8765432102', email: 'builders@hub.com', company_name: 'Builder\'s Hub', billing_address: 'Noida', gst_number: '07AABCU5234F1Z0' },
      { name: 'Retail Outlet A', phone: '8765432103', whatsapp_phone: '8765432103', email: 'retail@outlet.com', company_name: 'Retail Outlet A', billing_address: 'Delhi', gst_number: '07AABCU6234F1Z0' },
      { name: 'Corporate Buyer', phone: '8765432104', whatsapp_phone: '8765432104', email: 'corporate@buyer.com', company_name: 'Corporate Buyer Ltd', billing_address: 'Bangalore', gst_number: '07AABCU7234F1Z0' },
    ];

    const customerIds = [];
    for (const customer of customers) {
      const result = await sql`
        INSERT INTO stock_customers (name, phone, whatsapp_phone, email, company_name, billing_address, gst_number)
        VALUES (${customer.name}, ${customer.phone}, ${customer.whatsapp_phone}, ${customer.email}, ${customer.company_name}, ${customer.billing_address}, ${customer.gst_number})
        RETURNING id
      `;
      if (result.length > 0) customerIds.push(result[0].id);
    }
    console.log(`✅ Created ${customerIds.length} customers`);

    // Transporters
    const transporters = [
      { name: 'Fast Transport', contact_name: 'Ravi', phone: '7654321000', gst_number: '07AABCT1234F1Z0', address: 'Delhi', vehicle_number: 'DL01AB1234' },
      { name: 'Reliable Haulers', contact_name: 'Vikram', phone: '7654321001', gst_number: '07AABCT2234F1Z0', address: 'Noida', vehicle_number: 'UP14MN5678' },
      { name: 'Express Logistics', contact_name: 'Amit', phone: '7654321002', gst_number: '07AABCT3234F1Z0', address: 'Gurgaon', vehicle_number: 'HR26PH9012' },
      { name: 'Local Movers', contact_name: 'Suresh', phone: '7654321003', gst_number: '07AABCT4234F1Z0', address: 'Delhi', vehicle_number: 'DL09XY3456' },
    ];

    const transporterIds = [];
    for (const transporter of transporters) {
      const result = await sql`
        INSERT INTO stock_transporters (name, contact_name, phone, gst_number, address)
        VALUES (${transporter.name}, ${transporter.contact_name}, ${transporter.phone}, ${transporter.gst_number}, ${transporter.address})
        ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone
        RETURNING id
      `;
      if (result.length > 0) transporterIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${transporterIds.length} transporters`);

    // Vehicles
    const vehicleData = [
      { vehicle_number: 'DL01AB1234', vehicle_type: 'Truck', driver_name: 'Harish', driver_phone: '9876543300', transporter_id: transporterIds[0] },
      { vehicle_number: 'UP14MN5678', vehicle_type: 'Truck', driver_name: 'Sanjay', driver_phone: '9876543301', transporter_id: transporterIds[1] },
      { vehicle_number: 'HR26PH9012', vehicle_type: 'Truck', driver_name: 'Mohit', driver_phone: '9876543302', transporter_id: transporterIds[2] },
      { vehicle_number: 'DL09XY3456', vehicle_type: 'Truck', driver_name: 'Deepak', driver_phone: '9876543303', transporter_id: transporterIds[3] },
    ];

    const vehicleIds = [];
    for (const vehicle of vehicleData) {
      const result = await sql`
        INSERT INTO stock_vehicles (vehicle_number, vehicle_type, driver_name, driver_phone, transporter_id)
        VALUES (${vehicle.vehicle_number}, ${vehicle.vehicle_type}, ${vehicle.driver_name}, ${vehicle.driver_phone}, ${vehicle.transporter_id})
        ON CONFLICT (vehicle_number) DO UPDATE SET driver_name = EXCLUDED.driver_name
        RETURNING id
      `;
      if (result.length > 0) vehicleIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${vehicleIds.length} vehicles`);

    // Sales People
    const salesPeople = [
      { name: 'Rajesh Kumar', phone: '9876543400', email: 'rajesh@sales.com', whatsapp_phone: '9876543400' },
      { name: 'Deepika Singh', phone: '9876543401', email: 'deepika@sales.com', whatsapp_phone: '9876543401' },
      { name: 'Arjun Patel', phone: '9876543402', email: 'arjun@sales.com', whatsapp_phone: '9876543402' },
      { name: 'Neha Sharma', phone: '9876543403', email: 'neha@sales.com', whatsapp_phone: '9876543403' },
    ];

    const salesPeopleIds = [];
    for (const person of salesPeople) {
      const result = await sql`
        INSERT INTO stock_sales_people (name, phone, email, whatsapp_phone)
        VALUES (${person.name}, ${person.phone}, ${person.email}, ${person.whatsapp_phone})
        RETURNING id
      `;
      if (result.length > 0) salesPeopleIds.push(result[0].id);
    }
    console.log(`✅ Created ${salesPeopleIds.length} sales people`);

    // ===== SEED USERS WITH DIFFERENT ROLES =====
    console.log('\n👥 Seeding users with role-based access...');

    const users = [
      // Admin users
      { name: 'Admin User', phone: '9111111111', email: 'admin@stock.com', role: 'admin', status: 'active' },
      { name: 'Super Admin', phone: '9111111112', email: 'superadmin@stock.com', role: 'admin', status: 'active' },
      // Manager users
      { name: 'Manager One', phone: '9222222221', email: 'manager1@stock.com', role: 'manager', status: 'active' },
      { name: 'Manager Two', phone: '9222222222', email: 'manager2@stock.com', role: 'manager', status: 'active' },
      // Stock Maintainer
      { name: 'Stock Maintainer A', phone: '9333333331', email: 'maintainer1@stock.com', role: 'stock_maintainer', status: 'active' },
      { name: 'Stock Maintainer B', phone: '9333333332', email: 'maintainer2@stock.com', role: 'stock_maintainer', status: 'active' },
      { name: 'Stock Maintainer C', phone: '9333333333', email: 'maintainer3@stock.com', role: 'stock_maintainer', status: 'active' },
      // Salesperson users
      { name: 'Salesperson One', phone: '9444444441', email: 'salesperson1@stock.com', role: 'salesperson', status: 'active' },
      { name: 'Salesperson Two', phone: '9444444442', email: 'salesperson2@stock.com', role: 'salesperson', status: 'active' },
    ];

    const userIds = [];
    for (const user of users) {
      try {
        const result = await sql`
          INSERT INTO stock_app_users (name, phone, email, role, status)
          VALUES (${user.name}, ${user.phone}, ${user.email}, ${user.role}, ${user.status})
          ON CONFLICT (email) DO NOTHING
          RETURNING id
        `;
        if (result.length > 0) userIds.push(result[0].id);
      } catch (err) {
        // Skip if user already exists or constraint violation
        console.log(`⏭️  Skipping user ${user.email} (may already exist)`);
      }
    }
    console.log(`✅ Created/found ${userIds.length} users (2 admins, 2 managers, 3 maintainers, 2 salespeople)`);

    // ===== SEED STOCK ITEMS =====
    console.log('\n📦 Seeding stock items...');

    const items = [
      { sku: 'KAJ-600-WHT', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[0], name: 'Kajaria White 600x600', tiles_per_box: 4, pieces_per_box: 4, purchase_price: 450, selling_price: 599 },
      { sku: 'KAJ-800-BLK', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[1], name: 'Kajaria Black 800x800', tiles_per_box: 2, pieces_per_box: 2, purchase_price: 850, selling_price: 1199 },
      { sku: 'SOM-600-GRY', brand_id: brandIds[1], type_id: typeIds[0], size_id: sizeIds[0], name: 'Somany Grey 600x600', tiles_per_box: 4, pieces_per_box: 4, purchase_price: 400, selling_price: 549 },
      { sku: 'BRL-MBL-CRM', brand_id: brandIds[2], type_id: typeIds[1], size_id: sizeIds[2], name: 'Brillant Marble Cream 1200x600', tiles_per_box: 2, pieces_per_box: 4, purchase_price: 1200, selling_price: 1799 },
      { sku: 'NIT-GRN-300', brand_id: brandIds[3], type_id: typeIds[0], size_id: sizeIds[3], name: 'Nitco Green 300x600', tiles_per_box: 8, pieces_per_box: 8, purchase_price: 180, selling_price: 299 },
      { sku: 'RAK-PORT-GOLD', brand_id: brandIds[4], type_id: typeIds[2], size_id: sizeIds[0], name: 'Rak Granite Gold 600x600', tiles_per_box: 4, pieces_per_box: 4, purchase_price: 650, selling_price: 899 },
      { sku: 'KAJ-BEIGE-1200', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[4], name: 'Kajaria Beige 600x1200', tiles_per_box: 2, pieces_per_box: 2, purchase_price: 900, selling_price: 1299 },
      { sku: 'SOM-BLUE-300', brand_id: brandIds[1], type_id: typeIds[3], size_id: sizeIds[3], name: 'Somany Blue 300x600', tiles_per_box: 8, pieces_per_box: 8, purchase_price: 220, selling_price: 349 },
    ];

    const itemIds = [];
    for (const item of items) {
      const result = await sql`
        INSERT INTO stock_items (
          sku, brand_id, type_id, size_id, name, tiles_per_box, pieces_per_box,
          purchase_price, selling_price, unit_of_measure, reorder_level
        ) VALUES (
          ${item.sku}, ${item.brand_id}, ${item.type_id}, ${item.size_id}, ${item.name},
          ${item.tiles_per_box}, ${item.pieces_per_box}, ${item.purchase_price}, ${item.selling_price}, 'box', 20
        )
        ON CONFLICT (sku) DO UPDATE SET selling_price = EXCLUDED.selling_price
        RETURNING id
      `;
      if (result.length > 0) itemIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${itemIds.length} stock items`);

    // ===== SEED PURCHASE ORDERS & INBOUND SHIPMENTS =====
    console.log('\n📥 Seeding purchase orders and inbound shipments with various statuses...');

    // Check if shipments already exist
    const existingShipments = await sql`SELECT COUNT(*) as count FROM stock_inbound_shipments`;
    if (existingShipments[0].count > 0) {
      console.log(`⏭️  Skipping shipment seeding (${existingShipments[0].count} shipments already exist)`);
    } else {

    // Create scenarios for different statuses
    const purchaseScenarios = [
      // Approved shipment (arrived 5 days ago)
      {
        po_number: 'PO-2026-001',
        supplier_id: supplierIds[0],
        order_date: getDateInMonth(1),
        expected_arrival_date: getDateInMonth(3),
        status: 'received',
        total_amount: 45000,
        shipment_status: 'received',
        approval_status: 'approved',
        shipment_number: 'INBOUND-001',
        arrival_date: getDateInMonth(5),
        submitted_date: getDateInMonth(5),
        reviewed_date: getDateInMonth(5),
        approved_date: addHours(getDateInMonth(5), 2),
        submitted_by: userIds[4], // maintainer
        reviewed_by: userIds[2], // manager
        approved_by: userIds[0], // admin
        items: [
          { item_id: itemIds[0], ordered_qty: 100, received_whole: 95, received_broken: 5 },
          { item_id: itemIds[2], ordered_qty: 80, received_whole: 80, received_broken: 0 },
        ],
      },
      // Pending approval (submitted today)
      {
        po_number: 'PO-2026-002',
        supplier_id: supplierIds[1],
        order_date: getDateInMonth(2),
        expected_arrival_date: getDateInMonth(4),
        status: 'draft',
        total_amount: 38500,
        shipment_status: 'submitted',
        approval_status: 'pending',
        shipment_number: 'INBOUND-002',
        arrival_date: getDateInMonth(8),
        submitted_date: getDateInMonth(8),
        submitted_by: userIds[5], // maintainer
        items: [
          { item_id: itemIds[1], ordered_qty: 50, received_whole: 50, received_broken: 0 },
          { item_id: itemIds[4], ordered_qty: 120, received_whole: 120, received_broken: 0 },
        ],
      },
      // Changes requested (submitted 3 days ago, manager requested changes)
      {
        po_number: 'PO-2026-003',
        supplier_id: supplierIds[2],
        order_date: getDateInMonth(3),
        expected_arrival_date: getDateInMonth(7),
        status: 'draft',
        total_amount: 52300,
        shipment_status: 'submitted',
        approval_status: 'changes_requested',
        shipment_number: 'INBOUND-003',
        arrival_date: getDateInMonth(6),
        submitted_date: getDateInMonth(6),
        reviewed_date: getDateInMonth(6),
        submitted_by: userIds[4],
        reviewed_by: userIds[3], // manager
        approval_notes: 'Please verify the broken quantity count',
        items: [
          { item_id: itemIds[3], ordered_qty: 40, received_whole: 35, received_broken: 5 },
          { item_id: itemIds[5], ordered_qty: 60, received_whole: 58, received_broken: 2 },
        ],
      },
      // Rejected (submitted 2 days ago)
      {
        po_number: 'PO-2026-004',
        supplier_id: supplierIds[0],
        order_date: getDateInMonth(4),
        expected_arrival_date: getDateInMonth(8),
        status: 'draft',
        total_amount: 35000,
        shipment_status: 'submitted',
        approval_status: 'rejected',
        shipment_number: 'INBOUND-004',
        arrival_date: getDateInMonth(7),
        submitted_date: getDateInMonth(7),
        reviewed_date: getDateInMonth(7),
        submitted_by: userIds[5],
        reviewed_by: userIds[2],
        approval_notes: 'Goods damaged during transit, requesting replacement shipment',
        items: [
          { item_id: itemIds[2], ordered_qty: 100, received_whole: 60, received_broken: 40 },
        ],
      },
      // Approved (arrived yesterday)
      {
        po_number: 'PO-2026-005',
        supplier_id: supplierIds[3],
        order_date: getDateInMonth(9),
        expected_arrival_date: getDateInMonth(11),
        status: 'received',
        total_amount: 42000,
        shipment_status: 'received',
        approval_status: 'approved',
        shipment_number: 'INBOUND-005',
        arrival_date: getDateInMonth(10),
        submitted_date: getDateInMonth(10),
        reviewed_date: getDateInMonth(10),
        approved_date: addHours(getDateInMonth(10), 1),
        submitted_by: userIds[4],
        reviewed_by: userIds[3],
        approved_by: userIds[1], // admin
        items: [
          { item_id: itemIds[6], ordered_qty: 75, received_whole: 75, received_broken: 0 },
          { item_id: itemIds[7], ordered_qty: 90, received_whole: 88, received_broken: 2 },
        ],
      },
      // Pending review (submitted in middle of month)
      {
        po_number: 'PO-2026-006',
        supplier_id: supplierIds[1],
        order_date: getDateInMonth(12),
        expected_arrival_date: getDateInMonth(16),
        status: 'draft',
        total_amount: 48000,
        shipment_status: 'submitted',
        approval_status: 'reviewed',
        shipment_number: 'INBOUND-006',
        arrival_date: getDateInMonth(15),
        submitted_date: getDateInMonth(15),
        reviewed_date: getDateInMonth(15),
        submitted_by: userIds[5],
        reviewed_by: userIds[2],
        items: [
          { item_id: itemIds[0], ordered_qty: 110, received_whole: 100, received_broken: 10 },
          { item_id: itemIds[1], ordered_qty: 65, received_whole: 65, received_broken: 0 },
        ],
      },
    ];

    let poCount = 0, inboundCount = 0;

    for (const scenario of purchaseScenarios) {
      try {
        // Create purchase order
        const poResult = await sql`
          INSERT INTO stock_purchase_orders (
            po_number, supplier_id, order_date, expected_arrival_date, status, total_amount, created_by
          ) VALUES (
            ${scenario.po_number}, ${scenario.supplier_id}, ${scenario.order_date}, 
            ${scenario.expected_arrival_date}, ${scenario.status}, ${scenario.total_amount}, 'seed-script'
          )
          RETURNING id
        `;
        poCount++;

        const poId = poResult[0].id;
        const truckPlate = 'TRK-' + scenario.shipment_number.slice(-3);

        // Create inbound shipment
        const inboundResult = await sql`
          INSERT INTO stock_inbound_shipments (
            shipment_number, purchase_order_id, supplier_id, transporter_id, vehicle_id,
            truck_license_plate, driver_name, driver_phone,
            arrival_date, submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id,
            approval_status, approval_notes, approved_at, approved_by_user_id,
            status, total_whole_qty, total_broken_qty, created_by
          ) VALUES (
            ${scenario.shipment_number}, ${poId}, ${scenario.supplier_id},
            ${scenario.supplier_id === supplierIds[0] ? transporterIds[0] : 
              scenario.supplier_id === supplierIds[1] ? transporterIds[1] :
              scenario.supplier_id === supplierIds[2] ? transporterIds[2] : transporterIds[3]},
            ${vehicleIds[0]},
            ${truckPlate}, 'Driver Name', '9876543350',
            ${scenario.arrival_date}, ${scenario.submitted_date}, ${scenario.submitted_by},
            ${scenario.reviewed_date || null}, ${scenario.reviewed_by || null},
            ${scenario.approval_status}, ${scenario.approval_notes || null},
            ${scenario.approved_date || null}, ${scenario.approved_by || null},
            ${scenario.shipment_status}, 
            ${scenario.items.reduce((sum, item) => sum + item.received_whole, 0)},
            ${scenario.items.reduce((sum, item) => sum + item.received_broken, 0)},
            'seed-script'
          )
          RETURNING id
        `;
        inboundCount++;

        const inboundId = inboundResult[0].id;

        // Add inbound shipment items
        for (const item of scenario.items) {
          await sql`
            INSERT INTO stock_inbound_shipment_items (
              inbound_shipment_id, item_id, ordered_qty, received_whole_qty, received_broken_qty, unit_cost
            ) VALUES (
              ${inboundId}, ${item.item_id}, ${item.ordered_qty}, ${item.received_whole}, ${item.received_broken}, 500
            )
          `;
        }
      } catch (err) {
        if (err.code === '23505') {
          // Duplicate key - data already exists
          poCount = -1;  // Mark that we skipped
          break;
        } else {
          throw err;
        }
      }
    }

    if (poCount === -1) {
      console.log(`⏭️  Skipping shipment seeding (data already exists)`);
      poCount = 0;
      inboundCount = 0;
    }
    } // close the else for inbound shipments

    console.log(`✅ Created ${poCount} purchase orders and ${inboundCount} inbound shipments`);

    // ===== SEED SALES ORDERS & OUTBOUND SHIPMENTS =====
    console.log('\n📤 Seeding sales orders and outbound shipments...');

    const existingOutboundShipments = await sql`SELECT COUNT(*) as count FROM stock_outbound_shipments`;
    if (existingOutboundShipments[0].count > 0) {
      console.log(`⏭️  Skipping outbound shipment seeding (${existingOutboundShipments[0].count} shipments already exist)`);
    } else {
    const salesScenarios = [
      // Delivered (3 days ago)
      {
        order_number: 'SO-2026-001',
        customer_id: customerIds[0],
        order_date: getDateInMonth(4),
        status: 'dispatched',
        total_amount: 25000,
        dispatch_status: 'dispatched',
        approval_status: 'approved',
        shipment_number: 'OUTBOUND-001',
        dispatch_date: getDateInMonth(6),
        submitted_date: getDateInMonth(6),
        reviewed_date: getDateInMonth(6),
        approved_date: addHours(getDateInMonth(6), 1),
        submitted_by: userIds[4],
        reviewed_by: userIds[2],
        approved_by: userIds[0],
        items: [
          { item_id: itemIds[0], ordered_qty: 50, loaded_whole: 50, loaded_broken: 0 },
        ],
      },
      // Approved, pending dispatch
      {
        order_number: 'SO-2026-002',
        customer_id: customerIds[1],
        order_date: getDateInMonth(8),
        status: 'picked',
        dispatch_status: 'submitted',
        approval_status: 'approved',
        shipment_number: 'OUTBOUND-002',
        dispatch_date: getDateInMonth(9),
        submitted_date: getDateInMonth(9),
        reviewed_date: getDateInMonth(9),
        approved_date: addHours(getDateInMonth(9), 2),
        submitted_by: userIds[5],
        reviewed_by: userIds[3],
        approved_by: userIds[1],
        items: [
          { item_id: itemIds[2], ordered_qty: 80, loaded_whole: 80, loaded_broken: 0 },
          { item_id: itemIds[4], ordered_qty: 60, loaded_whole: 60, loaded_broken: 0 },
        ],
      },
      // Pending approval
      {
        order_number: 'SO-2026-003',
        customer_id: customerIds[2],
        order_date: getDateInMonth(10),
        status: 'picked',
        dispatch_status: 'submitted',
        approval_status: 'pending',
        shipment_number: 'OUTBOUND-003',
        dispatch_date: getDateInMonth(10),
        submitted_date: getDateInMonth(10),
        submitted_by: userIds[4],
        items: [
          { item_id: itemIds[1], ordered_qty: 40, loaded_whole: 40, loaded_broken: 0 },
          { item_id: itemIds[3], ordered_qty: 30, loaded_whole: 30, loaded_broken: 0 },
        ],
      },
      // Delivered (5 days ago)
      {
        order_number: 'SO-2026-004',
        customer_id: customerIds[3],
        order_date: getDateInMonth(2),
        status: 'dispatched',
        dispatch_status: 'dispatched',
        approval_status: 'approved',
        shipment_number: 'OUTBOUND-004',
        dispatch_date: getDateInMonth(5),
        submitted_date: getDateInMonth(5),
        reviewed_date: getDateInMonth(5),
        approved_date: addHours(getDateInMonth(5), 1),
        submitted_by: userIds[5],
        reviewed_by: userIds[2],
        approved_by: userIds[0],
        items: [
          { item_id: itemIds[5], ordered_qty: 35, loaded_whole: 35, loaded_broken: 0 },
        ],
      },
      // Changes requested
      {
        order_number: 'SO-2026-005',
        customer_id: customerIds[4],
        order_date: getDateInMonth(7),
        status: 'picked',
        dispatch_status: 'submitted',
        approval_status: 'changes_requested',
        shipment_number: 'OUTBOUND-005',
        dispatch_date: getDateInMonth(8),
        submitted_date: getDateInMonth(8),
        reviewed_date: getDateInMonth(8),
        submitted_by: userIds[4],
        reviewed_by: userIds[3],
        approval_notes: 'Please add insurance and confirm delivery date',
        items: [
          { item_id: itemIds[6], ordered_qty: 60, loaded_whole: 60, loaded_broken: 0 },
        ],
      },
    ];

    let soCount = 0, outboundCount = 0;

    for (const scenario of salesScenarios) {
      const soResult = await sql`
        INSERT INTO stock_sales_orders (
          order_number, customer_id, order_date, status, total_amount, created_by
        ) VALUES (
          ${scenario.order_number}, ${scenario.customer_id}, ${scenario.order_date},
          ${scenario.status}, ${scenario.total_amount}, 'seed-script'
        )
        RETURNING id
      `;
      soCount++;

      const soId = soResult[0].id;
      const truckPlate = 'TRK-' + scenario.shipment_number.slice(-3);

      const outboundResult = await sql`
        INSERT INTO stock_outbound_shipments (
          shipment_number, sales_order_id, vehicle_id, customer_name, customer_phone,
          truck_license_plate, driver_name, driver_phone,
          submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id,
          approval_status, approval_notes, approved_at, approved_by_user_id,
          dispatch_date, status, created_by
        ) VALUES (
          ${scenario.shipment_number}, ${soId}, ${vehicleIds[0]},
          'Customer Name', '9876543360', ${truckPlate},
          'Driver', '9876543361',
          ${scenario.submitted_date}, ${scenario.submitted_by},
          ${scenario.reviewed_date || null}, ${scenario.reviewed_by || null},
          ${scenario.approval_status}, ${scenario.approval_notes || null},
          ${scenario.approved_date || null}, ${scenario.approved_by || null},
          ${scenario.dispatch_date}, ${scenario.dispatch_status}, 'seed-script'
        )
        RETURNING id
      `;
      outboundCount++;

      const outboundId = outboundResult[0].id;

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
    } // close the else for outbound shipments

    console.log(`✅ Created ${soCount} sales orders and ${outboundCount} outbound shipments`);

    // ===== SEED CHANGE REQUESTS =====
    console.log('\n🔄 Seeding change requests for manager/admin workflow...');

    // Check if change requests already exist
    const existingChangeRequests = await sql`SELECT COUNT(*) as count FROM stock_change_requests`;
    if (existingChangeRequests[0].count > 0) {
      console.log(`⏭️  Skipping change request seeding (${existingChangeRequests[0].count} requests already exist)`);
    } else {

    const changeRequests = [
      {
        request_number: 'CR-2026-001',
        source_entity_type: 'inbound_shipment',
        source_entity_id: 2,
        request_type: 'correct',
        status: 'pending',
        reason: 'Quantity mismatch in received items - need to recount',
        priority: 'high',
        requested_by: userIds[4],
        requested_by_name: 'Stock Maintainer A',
      },
      {
        request_number: 'CR-2026-002',
        source_entity_type: 'outbound_shipment',
        source_entity_id: 3,
        request_type: 'update',
        status: 'approved',
        reason: 'Update delivery date and add insurance',
        priority: 'normal',
        requested_by: userIds[5],
        requested_by_name: 'Stock Maintainer B',
        reviewed_by: userIds[2],
        approved_by: userIds[0],
      },
      {
        request_number: 'CR-2026-003',
        source_entity_type: 'inbound_shipment',
        source_entity_id: 5,
        request_type: 'approve',
        status: 'approved',
        reason: 'Verify and approve inbound shipment after manager review',
        priority: 'normal',
        requested_by: userIds[2],
        requested_by_name: 'Manager One',
        reviewed_by: userIds[0],
        approved_by: userIds[0],
      },
      {
        request_number: 'CR-2026-004',
        source_entity_type: 'stock_item',
        source_entity_id: 1,
        request_type: 'update',
        status: 'reviewed',
        reason: 'Need to update stock item price',
        priority: 'low',
        requested_by: userIds[4],
        requested_by_name: 'Stock Maintainer A',
        reviewed_by: userIds[3],
      },
      {
        request_number: 'CR-2026-005',
        source_entity_type: 'inbound_shipment',
        source_entity_id: 1,
        request_type: 'correct',
        status: 'pending',
        reason: 'Need to record missing documentation for audit',
        priority: 'urgent',
        requested_by: userIds[5],
        requested_by_name: 'Stock Maintainer B',
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
    }

    console.log(`✅ Created ${crCount} change requests`);

    // ===== SEED TIMELINE EVENTS =====
    console.log('\n📊 Seeding timeline events for visualization...');

    // Only seed if not already done
    const existingEvents = await sql`SELECT COUNT(*) as count FROM stock_timeline_events`;
    if (existingEvents[0].count === 0) {

    const events = [
      { event_type: 'inbound_submitted', summary: 'Inbound shipment INBOUND-001 submitted', entity_id: 1, recorded_by: userIds[4] },
      { event_type: 'inbound_reviewed', summary: 'Inbound shipment INBOUND-001 reviewed', entity_id: 1, recorded_by: userIds[2] },
      { event_type: 'inbound_approved', summary: 'Inbound shipment INBOUND-001 approved', entity_id: 1, recorded_by: userIds[0] },
      { event_type: 'inbound_received', summary: 'Inbound shipment INBOUND-001 received and logged', entity_id: 1, recorded_by: userIds[4] },
      
      { event_type: 'inbound_submitted', summary: 'Inbound shipment INBOUND-002 submitted', entity_id: 2, recorded_by: userIds[5] },
      
      { event_type: 'inbound_submitted', summary: 'Inbound shipment INBOUND-003 submitted', entity_id: 3, recorded_by: userIds[4] },
      { event_type: 'change_requested', summary: 'Changes requested on INBOUND-003 - verify broken qty', entity_id: 3, recorded_by: userIds[3] },
      
      { event_type: 'outbound_submitted', summary: 'Outbound shipment OUTBOUND-001 submitted', entity_id: 1, recorded_by: userIds[4] },
      { event_type: 'outbound_reviewed', summary: 'Outbound shipment OUTBOUND-001 reviewed', entity_id: 1, recorded_by: userIds[2] },
      { event_type: 'outbound_approved', summary: 'Outbound shipment OUTBOUND-001 approved', entity_id: 1, recorded_by: userIds[0] },
      { event_type: 'outbound_dispatched', summary: 'Outbound shipment OUTBOUND-001 dispatched', entity_id: 1, recorded_by: userIds[4] },
      
      { event_type: 'outbound_submitted', summary: 'Outbound shipment OUTBOUND-002 submitted', entity_id: 2, recorded_by: userIds[5] },
      { event_type: 'outbound_approved', summary: 'Outbound shipment OUTBOUND-002 approved', entity_id: 2, recorded_by: userIds[1] },
      
      { event_type: 'outbound_submitted', summary: 'Outbound shipment OUTBOUND-003 submitted', entity_id: 3, recorded_by: userIds[4] },
      
      { event_type: 'user_created', summary: 'Stock maintainer user created', entity_id: userIds[4], recorded_by: userIds[0] },
    ];

    let eventCount = 0;
    for (const event of events) {
      await sql`
        INSERT INTO stock_timeline_events (
          event_number, event_type, entity_type, entity_id, recorded_by_user_id, summary, occurred_at
        ) VALUES (
          'EVT-' || LPAD(${eventCount + 1}::TEXT, 4, '0'),
          ${event.event_type}, 'shipment', ${event.entity_id}, ${event.recorded_by},
          ${event.summary},
          NOW() - INTERVAL '${Math.random() * 10} days'
        )
      `;
      eventCount++;
    }
    } else {
      console.log(`⏭️  Skipping timeline event seeding (${existingEvents[0].count} events already exist)`);
    }

    console.log(`✅ Created ${eventCount} timeline events`);

    // ===== SEED NOTIFICATIONS =====
    console.log('\n📬 Seeding notifications...');

    // Only seed if not already done
    const existingNotifications = await sql`SELECT COUNT(*) as count FROM stock_notifications`;
    if (existingNotifications[0].count === 0) {

    const notifications = [
      {
        notification_number: 'NOTIF-001',
        channel: 'whatsapp',
        event_type: 'inbound_arrival',
        recipients: JSON.stringify([{ phone: '9876543400', name: 'Rajesh Kumar' }]),
        message_text: 'New inbound shipment INBOUND-001 arrived. Pending approval.',
        status: 'sent',
      },
      {
        notification_number: 'NOTIF-002',
        channel: 'whatsapp',
        event_type: 'outbound_dispatch',
        recipients: JSON.stringify([{ phone: '8765432100', name: 'John Contractor' }]),
        message_text: 'Your order OUTBOUND-001 has been dispatched. Estimated delivery in 2 days.',
        status: 'sent',
      },
      {
        notification_number: 'NOTIF-003',
        channel: 'email',
        event_type: 'low_stock',
        recipients: JSON.stringify([{ email: 'manager1@stock.com', name: 'Manager One' }]),
        message_text: 'Stock level for item KAJ-600-WHT is below reorder level (5 boxes remaining).',
        status: 'pending',
      },
    ];

    let notifCount = 0;
    for (const notif of notifications) {
      await sql`
        INSERT INTO stock_notifications (
          notification_number, channel, event_type, recipients, message_text, status
        ) VALUES (
          ${notif.notification_number}, ${notif.channel}, ${notif.event_type},
          ${notif.recipients}, ${notif.message_text}, ${notif.status}
        )
      `;
      notifCount++;
    }
    } else {
      console.log(`⏭️  Skipping notifications seeding (${existingNotifications[0].count} notifications already exist)`);
    }

    console.log(`✅ Created ${notifCount} notifications`);

    console.log('\n✨ Database seeding/verification completed! ✨\n');
    
    // Show actual database statistics
    console.log('📊 Actual Database Content Summary:');
    
    const tables = [
      'stock_brands', 'stock_types', 'stock_sizes', 'stock_locations',
      'stock_suppliers', 'stock_customers', 'stock_transporters', 'stock_vehicles',
      'stock_sales_people', 'stock_app_users', 'stock_items',
      'stock_purchase_orders', 'stock_inbound_shipments', 'stock_sales_orders',
      'stock_outbound_shipments', 'stock_change_requests', 'stock_timeline_events',
      'stock_notifications'
    ];
    
    for (const table of tables) {
      try {
        const result = await sql`SELECT COUNT(*) as count FROM ${sql(table)}`;
        console.log(`   • ${table}: ${result[0].count} records`);
      } catch (err) {
        console.log(`   • ${table}: [not accessible]`);
      }
    }

    console.log('\n🎯 Ready for monthly graph visualization and admin role validation!\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the seeding
seedStockDatabase();
