#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateSalespersonSalary() {
  try {
    await sql`
      ALTER TABLE stock_app_users
        ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS monthly_sales_goal NUMERIC(12,2) DEFAULT NULL;
    `;
    console.log('Salesperson salary migration completed successfully.');
  } catch (error) {
    console.error('Failed to run salesperson salary migration:', error.message);
    process.exit(1);
  }
}

migrateSalespersonSalary();
