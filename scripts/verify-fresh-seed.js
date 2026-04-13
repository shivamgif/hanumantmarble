#!/usr/bin/env node

/**
 * Database Verification Script
 * Confirms seeded data is present and accessible
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function verifyDatabase() {
  console.log('🔍 Verifying Fresh Seed Data...\n');

  try {
    // Check users
    const users = await sql`
      SELECT role, COUNT(*) as count FROM stock_app_users 
      GROUP BY role ORDER BY role
    `;
    console.log('👥 Users by Role:');
    for (const row of users) {
      console.log(`   • ${row.role}: ${row.count}`);
    }

    // Check inbound shipments
    const inbound = await sql`
      SELECT approval_status, COUNT(*) as count 
      FROM stock_inbound_shipments 
      GROUP BY approval_status 
      ORDER BY approval_status
    `;
    console.log('\n📥 Inbound Shipments by Status:');
    for (const row of inbound) {
      console.log(`   • ${row.approval_status}: ${row.count}`);
    }

    // Check outbound shipments
    const outbound = await sql`
      SELECT approval_status, COUNT(*) as count 
      FROM stock_outbound_shipments 
      GROUP BY approval_status 
      ORDER BY approval_status
    `;
    console.log('\n📤 Outbound Shipments by Status:');
    for (const row of outbound) {
      console.log(`   • ${row.approval_status}: ${row.count}`);
    }

    // Check recent inbound shipments
    const recent = await sql`
      SELECT 
        shipment_number, 
        approval_status, 
        arrival_date, 
        total_whole_qty,
        total_broken_qty
      FROM stock_inbound_shipments 
      ORDER BY arrival_date DESC
      LIMIT 6
    `;
    console.log('\n📋 Recent Inbound Arrivals:');
    for (const row of recent) {
      const days_ago = Math.floor((new Date() - new Date(row.arrival_date)) / (1000 * 60 * 60 * 24));
      console.log(`   • ${row.shipment_number} [${row.approval_status}] - ${row.total_whole_qty} good + ${row.total_broken_qty} broken (${days_ago}d ago)`);
    }

    // Check totals
    const totals = await sql`
      SELECT 
        (SELECT COUNT(*) FROM stock_brands) as brands,
        (SELECT COUNT(*) FROM stock_types) as types,
        (SELECT COUNT(*) FROM stock_sizes) as sizes,
        (SELECT COUNT(*) FROM stock_locations) as locations,
        (SELECT COUNT(*) FROM stock_suppliers) as suppliers,
        (SELECT COUNT(*) FROM stock_customers) as customers,
        (SELECT COUNT(*) FROM stock_items) as items,
        (SELECT COUNT(*) FROM stock_inbound_shipments) as inbound,
        (SELECT COUNT(*) FROM stock_outbound_shipments) as outbound,
        (SELECT COUNT(*) FROM stock_timeline_events) as events
    `;

    console.log('\n📊 Master Data Summary:');
    const t = totals[0];
    console.log(`   • Brands: ${t.brands}`);
    console.log(`   • Types: ${t.types}`);
    console.log(`   • Sizes: ${t.sizes}`);
    console.log(`   • Locations: ${t.locations}`);
    console.log(`   • Stock Items: ${t.items}`);
    console.log(`   • Inbound Shipments: ${t.inbound}`);
    console.log(`   • Outbound Shipments: ${t.outbound}`);
    console.log(`   • Timeline Events: ${t.events}`);

    console.log('\n✅ Verification complete! Database is ready for testing.');
    console.log('\n🚀 Next: npm run dev\n');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyDatabase();
