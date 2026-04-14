#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateNotificationReadColumns() {
  try {
    await sql`
      ALTER TABLE stock_notifications
      ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE
    `;

    await sql`
      ALTER TABLE stock_notifications
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMP
    `;

    console.log('Notification read columns migration completed successfully.');
  } catch (error) {
    console.error('Failed to run notification read columns migration:', error.message);
    process.exit(1);
  }
}

migrateNotificationReadColumns();
