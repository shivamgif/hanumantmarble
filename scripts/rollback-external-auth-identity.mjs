#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const rollbackFile = path.join(process.cwd(), 'scripts/migrations/2026-04-15-external-auth-identity-rollback.sql');

async function run() {
  try {
    const sqlText = fs.readFileSync(rollbackFile, 'utf8');
    await sql.query(sqlText, []);
    console.log('External auth identity rollback executed successfully.');
  } catch (error) {
    console.error('Failed to rollback external auth identity migration:', error.message);
    process.exit(1);
  }
}

run();
