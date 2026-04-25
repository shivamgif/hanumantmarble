#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateDepartmentColumns() {
  try {
    await sql`
      ALTER TABLE stock_app_users
      ADD COLUMN IF NOT EXISTS department TEXT
    `;

    await sql`
      ALTER TABLE stock_items
      ADD COLUMN IF NOT EXISTS department TEXT
    `;

    await sql`
      UPDATE stock_app_users
      SET department = 'Adhesive'
      WHERE role = 'salesperson'
        AND COALESCE(NULLIF(TRIM(department), ''), '') = ''
    `;

    await sql`
      UPDATE stock_items
      SET department = 'Adhesive'
      WHERE COALESCE(NULLIF(TRIM(department), ''), '') = ''
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_stock_app_users_role_department
      ON stock_app_users(role, department)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_stock_items_department
      ON stock_items(department)
    `;

    console.log('Department columns migration completed successfully.');
  } catch (error) {
    console.error('Failed to run department columns migration:', error.message);
    process.exit(1);
  }
}

migrateDepartmentColumns();
