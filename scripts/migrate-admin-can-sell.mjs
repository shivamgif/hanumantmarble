#!/usr/bin/env node

// Adds stock_app_users.can_sell — the flag that lets a non-salesperson (an
// admin who also sells) be picked in the salesperson dropdown and see their own
// performance. Capability only: it grants nothing else and restricts nothing.
//
// Local and production are separate Neon databases. Running this against
// .env.local does NOT reach production — run it there explicitly.

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateAdminCanSell() {
  try {
    await sql`
      ALTER TABLE stock_app_users
      ADD COLUMN IF NOT EXISTS can_sell BOOLEAN NOT NULL DEFAULT FALSE
    `;
    console.log('Ensured stock_app_users.can_sell exists (default FALSE).');

    const [row] = await sql`
      SELECT COUNT(*)::int AS sellers
      FROM stock_app_users
      WHERE can_sell = TRUE
    `;
    console.log(`Users explicitly flagged as sellers: ${row.sellers}.`);
    console.log('Salespeople are unaffected — role = \'salesperson\' still implies selling.');
    console.log('admin can_sell migration completed successfully.');
  } catch (error) {
    console.error('Failed to run admin can_sell migration:', error.message);
    process.exit(1);
  }
}

migrateAdminCanSell();
