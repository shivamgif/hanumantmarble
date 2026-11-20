// Applies db/migrations/*.sql in name order, each in its own transaction, and
// records it in schema_migrations. Replaces the old one-off scripts/migrate-*.mjs.
//
//   npm run db:migrate                         local (.env.local)
//   npm run db:migrate:prod scripts/migrate.mjs   production
//   ... --status                               list pending, change nothing
//   ... --mark-applied 0000_baseline.sql       record without running (existing DBs)
import { readdir, readFile } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';

// Migrations need the owner role; the app's app_rw login cannot ALTER tables.
// `netlify env:get` prints a sentence, not nothing, for an unset variable, so
// only take values that are actually connection strings.
const isUrl = (value) => /^postgres(ql)?:\/\//.test(String(value || '').trim());
const url = [process.env.DATABASE_OWNER_URL, process.env.DATABASE_URL].find(isUrl);
if (!url) throw new Error('Set DATABASE_OWNER_URL (or DATABASE_URL) to a postgres:// connection string.');

const dir = new URL('../db/migrations/', import.meta.url);
const args = process.argv.slice(2);
const markName = args.includes('--mark-applied') ? args[args.indexOf('--mark-applied') + 1] : null;
const statusOnly = args.includes('--status');

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  const { rows: [{ user }] } = await client.query('SELECT current_user AS user');
  if (user === 'app_rw') {
    throw new Error('Connected as app_rw, which cannot change the schema. Set DATABASE_OWNER_URL to the owner connection string.');
  }
  // Two deploys migrating at once would race on the same file.
  await client.query('SELECT pg_advisory_lock(7262001)');
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  if (markName) {
    if (!files.includes(markName)) throw new Error(`No such migration: ${markName}`);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [markName]);
    console.log(`Marked ${markName} as applied.`);
  } else {
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));

    // A database that predates the runner already has the baseline schema;
    // replaying it would fail half-way through. Make the operator say so.
    if (done.size === 0) {
      const { rows: [{ existing }] } = await client.query(`SELECT to_regclass('public.stock_items') IS NOT NULL AS existing`);
      if (existing) {
        throw new Error('This database already has the schema but no migration history. Run with --mark-applied 0000_baseline.sql first.');
      }
    }

    const pending = files.filter((f) => !done.has(f));
    if (statusOnly || pending.length === 0) {
      console.log(pending.length ? `Pending:\n  ${pending.join('\n  ')}` : 'Up to date.');
    } else {
      for (const file of pending) {
        const body = await readFile(new URL(file, dir), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(body);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`Applied ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw new Error(`${file} failed, rolled back: ${error.message}`);
        }
      }
    }
  }
} finally {
  client.release();
  await pool.end();
}
