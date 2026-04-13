#!/usr/bin/env node

/**
 * Verify Stock Database Seeding Status
 * Shows what data is currently in the database
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function verifyDatabase() {
  console.log('\n🔍 Stock Database Verification\n');
  console.log('📊 Current Database Statistics:\n');

  try {
    const tables = [
      ['stock_brands', 'Brands'],
      ['stock_types', 'Types'],
      ['stock_sizes', 'Sizes'],
      ['stock_locations', 'Locations'],
      ['stock_suppliers', 'Suppliers'],
      ['stock_customers', 'Customers'],
      ['stock_transporters', 'Transporters'],
      ['stock_vehicles', 'Vehicles'],
      ['stock_sales_people', 'Sales People'],
      ['stock_app_users', 'Users'],
      ['stock_items', 'Stock Items'],
      ['stock_purchase_orders', 'Purchase Orders'],
      ['stock_inbound_shipments', 'Inbound Shipments'],
      ['stock_sales_orders', 'Sales Orders'],
      ['stock_outbound_shipments', 'Outbound Shipments'],
      ['stock_change_requests', 'Change Requests'],
      ['stock_timeline_events', 'Timeline Events'],
      ['stock_notifications', 'Notifications'],
    ];

    let totalRecords = 0;

    for (const [tableName, displayName] of tables) {
      try {
        const result = await sql`SELECT COUNT(*) as count FROM ${sql(tableName)}`;
        const count = result[0].count;
        totalRecords += count;
        const icon = count > 0 ? '✅' : '⚠️ ';
        console.log(`   ${icon} ${displayName.padEnd(22)}: ${count} record${count !== 1 ? 's' : ''}`);
      } catch (err) {
        console.log(`   ❌ ${displayName.padEnd(22)}: [error accessing]`);
      }
    }

    // Additional insights
    console.log('\n📈 Workflow Status Insights:\n');

    try {
      const inboundStatus = await sql`
        SELECT approval_status, COUNT(*) as count
        FROM stock_inbound_shipments
        GROUP BY approval_status
        ORDER BY count DESC
      `;
      console.log('   Inbound Shipments Status:');
      for (const row of inboundStatus) {
        console.log(`      • ${row.approval_status || 'unknown'}: ${row.count}`);
      }
    } catch (e) {}

    try {
      const outboundStatus = await sql`
        SELECT approval_status, COUNT(*) as count
        FROM stock_outbound_shipments
        GROUP BY approval_status
        ORDER BY count DESC
      `;
      console.log('\n   Outbound Shipments Status:');
      for (const row of outboundStatus) {
        console.log(`      • ${row.approval_status || 'unknown'}: ${row.count}`);
      }
    } catch (e) {}

    try {
      const usersByRole = await sql`
        SELECT role, COUNT(*) as count
        FROM stock_app_users
        GROUP BY role
        ORDER BY role
      `;
      console.log('\n   Users by Role:');
      for (const row of usersByRole) {
        console.log(`      • ${row.role}: ${row.count}`);
      }
    } catch (e) {}

    console.log(`\n📊 Total Records in Database: ${totalRecords}\n`);

    if (totalRecords > 100) {
      console.log('✨ Database is seeded and ready for testing!\n');
      console.log('🎯 Next Steps:');
      console.log('   1. Start the dev server: npm run dev');
      console.log('   2. Login with test credentials');
      console.log('   3. Test role-based access control');
      console.log('   4. Verify monthly graph visualizations\n');
    } else {
      console.log('⚠️  Database may not be fully seeded.\n');
    }

  } catch (error) {
    console.error('❌ Error verifying database:', error.message);
    process.exit(1);
  }
}

verifyDatabase();
