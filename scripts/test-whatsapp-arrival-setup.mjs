#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runSetup() {
  const itemRows = await sql`SELECT id, sku, name FROM stock_items ORDER BY id ASC LIMIT 1`;
  const existingItem = itemRows[0];

  if (!existingItem) {
    throw new Error('No stock_items found. Seed data first.');
  }

  await sql`UPDATE stock_items SET department = 'Marble', updated_at = NOW() WHERE id = ${existingItem.id}`;

  const marbleRows = await sql`
    INSERT INTO stock_app_users (
      auth0_sub, name, phone, email, role, department, status,
      can_manage_users, can_approve_changes, can_view_dashboard, created_by
    ) VALUES (
      ${null}, ${'Test Sales Marble'}, ${'9990001111'}, ${'sales.marble.test@stock.local'},
      ${'salesperson'}, ${'Marble'}, ${'active'},
      ${false}, ${false}, ${true}, ${'test-setup-script'}
    )
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role,
      department = EXCLUDED.department,
      status = EXCLUDED.status,
      can_manage_users = EXCLUDED.can_manage_users,
      can_approve_changes = EXCLUDED.can_approve_changes,
      can_view_dashboard = EXCLUDED.can_view_dashboard,
      updated_at = NOW()
    RETURNING id, name, phone, email, role, department
  `;

  const graniteRows = await sql`
    INSERT INTO stock_app_users (
      auth0_sub, name, phone, email, role, department, status,
      can_manage_users, can_approve_changes, can_view_dashboard, created_by
    ) VALUES (
      ${null}, ${'Test Sales Granite'}, ${'9990002222'}, ${'sales.granite.test@stock.local'},
      ${'salesperson'}, ${'Granite'}, ${'active'},
      ${false}, ${false}, ${true}, ${'test-setup-script'}
    )
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role,
      department = EXCLUDED.department,
      status = EXCLUDED.status,
      can_manage_users = EXCLUDED.can_manage_users,
      can_approve_changes = EXCLUDED.can_approve_changes,
      can_view_dashboard = EXCLUDED.can_view_dashboard,
      updated_at = NOW()
    RETURNING id, name, phone, email, role, department
  `;

  const shipmentNumber = `INB-E2E-${Date.now()}`;
  const shipmentRows = await sql`
    INSERT INTO stock_inbound_shipments (
      shipment_number, supplier_id, arrival_date, submitted_at, submitted_by_user_id,
      approval_status, status, total_whole_qty, total_broken_qty, received_by,
      recorded_by_user_id, notes, created_by
    ) VALUES (
      ${shipmentNumber}, ${null}, NOW(), NOW(), ${null},
      ${'pending'}, ${'submitted'}, ${12}, ${0}, ${'test-e2e'},
      ${null}, ${'Controlled e2e test shipment'}, ${'test-setup-script'}
    )
    RETURNING id, shipment_number, approval_status, status
  `;

  const shipment = shipmentRows[0];

  await sql`
    INSERT INTO stock_inbound_shipment_items (
      inbound_shipment_id, item_id, ordered_qty, received_whole_qty, received_broken_qty,
      rejected_qty, unit_cost, landed_cost, notes
    ) VALUES (
      ${shipment.id}, ${existingItem.id}, ${12}, ${12}, ${0},
      ${0}, ${100}, ${100}, ${'Marble department controlled test row'}
    )
  `;

  const departmentMatches = await sql`
    SELECT id, name, email, phone,
           COALESCE(NULLIF(TRIM(department), ''), 'Adhesive') AS department
    FROM stock_app_users
    WHERE status = 'active'
      AND role = 'salesperson'
      AND COALESCE(NULLIF(TRIM(department), ''), 'Adhesive') = 'Marble'
    ORDER BY id ASC
  `;

  const ignoredSalespeople = await sql`
    SELECT id, name, email, phone,
           COALESCE(NULLIF(TRIM(department), ''), 'Adhesive') AS department
    FROM stock_app_users
    WHERE status = 'active'
      AND role = 'salesperson'
      AND COALESCE(NULLIF(TRIM(department), ''), 'Adhesive') <> 'Marble'
    ORDER BY id ASC
  `;

  console.log(JSON.stringify({
    setup: {
      marbleUser: marbleRows[0],
      graniteUser: graniteRows[0],
      itemUsed: { id: existingItem.id, sku: existingItem.sku, name: existingItem.name, department: 'Marble' },
      inboundShipment: shipment,
    },
    departmentMatchQuery: {
      inputDepartments: ['Marble'],
      matchedSalespeople: departmentMatches,
      ignoredSalespeople,
    },
  }, null, 2));
}

runSetup().catch((error) => {
  console.error('Setup failed:', error.message || error);
  process.exit(1);
});
