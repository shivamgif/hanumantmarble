#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateSalespersonMultiDivision() {
  try {
    // Ensure Adhesive division exists
    await sql`
      INSERT INTO stock_divisions (name)
      VALUES ('Adhesive')
      ON CONFLICT (name) DO NOTHING
    `;
    console.log('Ensured Adhesive division exists.');

    // Create junction table
    await sql`
      CREATE TABLE IF NOT EXISTS stock_user_divisions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES stock_app_users(id) ON DELETE CASCADE,
        division_id BIGINT NOT NULL REFERENCES stock_divisions(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, division_id)
      )
    `;
    console.log('Created stock_user_divisions junction table.');

    // Migrate existing division_id assignments for salespersons
    await sql`
      INSERT INTO stock_user_divisions (user_id, division_id)
      SELECT id, division_id
      FROM stock_app_users
      WHERE division_id IS NOT NULL
        AND role = 'salesperson'
      ON CONFLICT (user_id, division_id) DO NOTHING
    `;
    console.log('Migrated existing salesperson division assignments.');

    // Ensure every salesperson has Adhesive
    await sql`
      INSERT INTO stock_user_divisions (user_id, division_id)
      SELECT u.id, d.id
      FROM stock_app_users u
      CROSS JOIN stock_divisions d
      WHERE u.role = 'salesperson'
        AND d.name = 'Adhesive'
      ON CONFLICT (user_id, division_id) DO NOTHING
    `;
    console.log('Ensured all salespersons have Adhesive division.');

    console.log('Salesperson multi-division migration completed successfully.');
  } catch (error) {
    console.error('Failed to run salesperson multi-division migration:', error.message);
    process.exit(1);
  }
}

migrateSalespersonMultiDivision();
