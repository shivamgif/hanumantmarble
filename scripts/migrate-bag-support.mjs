#!/usr/bin/env node
/**
 * Adds bag-item support to stock_types and stock_items tables,
 * then seeds common bag product types.
 *
 * Run: node migrate-bag-support.mjs
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env.local') });

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('→ Adding category column to stock_types...');
    await client.query(`
      ALTER TABLE IF EXISTS stock_types
        ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'tile'
          CHECK (category IN ('tile', 'bag'))
    `);

    console.log('→ Adding weight_per_unit_kg and rate_per_bag to stock_items...');
    await client.query(`
      ALTER TABLE IF EXISTS stock_items
        ADD COLUMN IF NOT EXISTS weight_per_unit_kg NUMERIC(12, 3),
        ADD COLUMN IF NOT EXISTS rate_per_bag NUMERIC(12, 2)
    `);

    console.log('→ Seeding bag product types...');
    await client.query(`
      INSERT INTO stock_types (name, category, description) VALUES
        ('Adhesive',      'bag', 'Tile adhesive / fixing compound sold in bags'),
        ('Grout',         'bag', 'Tile grout / joint filler sold in bags'),
        ('White Cement',  'bag', 'White cement sold in bags'),
        ('Spacer',        'bag', 'Tile spacers sold in bags'),
        ('Marble Powder', 'bag', 'Marble powder sold in bags')
      ON CONFLICT (name) DO UPDATE
        SET category    = EXCLUDED.category,
            description = EXCLUDED.description
    `);

    await client.query('COMMIT');
    console.log('✓ Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed, rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
