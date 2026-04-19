import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL);

async function addIndexes() {
  const filePath = path.join(process.cwd(), 'scripts', 'migrations', '2026-04-19-add-performance-indexes.sql');
  const query = fs.readFileSync(filePath, 'utf8');
  
  console.log('Running performance indexes migration...');
  try {
    const statements = query
      .split(';')
      .filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'));
      
    for (const stmt of statements) {
      if (stmt.trim().toUpperCase() === 'BEGIN' || stmt.trim().toUpperCase() === 'COMMIT') continue;
      console.log(`Executing statement...`);
      await sql.query(stmt);
    }
    console.log('Successfully completed!');
  } catch (err) {
    console.error('Failed to run migration:', err);
  }
}

addIndexes();
