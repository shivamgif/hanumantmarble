// Merges duplicate stock_customers rows: every reference moves to the kept row,
// blank contact fields on it are filled from the duplicates, then the
// duplicates are deleted. One transaction; rolls back unless --apply is given.
//
//   node --env-file=.env.local scripts/merge-customers.mjs plan.json backup.json [--apply]
//   npm run db:migrate:prod scripts/merge-customers.mjs plan.json backup.json [--apply]
//
// plan.json: [{ "keep": 314, "merge": [78] }, ...] - exact ids, from a reviewed list.
// Each group must share one phone number (same 10-digit key the app matches on),
// so a plan built on one database cannot merge strangers on another.
import { readFile, writeFile } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';
import { PHONE_KEY } from '../lib/stock-customer-match.mjs';

const [planPath, backupPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
if (!planPath || !backupPath) throw new Error('Usage: merge-customers.mjs plan.json backup.json [--apply]');

const url = [process.env.DATABASE_OWNER_URL, process.env.DATABASE_URL].find((v) => /^postgres(ql)?:\/\//.test(String(v || '').trim()));
if (!url) throw new Error('Set DATABASE_OWNER_URL to a postgres:// connection string.');

const plan = JSON.parse(await readFile(planPath, 'utf8'));
const dups = plan.flatMap((g) => g.merge.map(Number));
const keeps = plan.flatMap((g) => g.merge.map(() => Number(g.keep)));
if (new Set(dups).size !== dups.length || dups.some((id) => keeps.includes(id))) {
  throw new Error('Plan lists a customer twice, or merges a row that another group keeps.');
}

// Every table with a foreign key to stock_customers (all NO ACTION, so the
// final DELETE fails loudly if one is missed).
const REFS = ['stock_outbound_shipments', 'stock_inbound_shipments', 'stock_sales_invoices', 'stock_sales_orders',
  'stock_customer_acknowledgements', 'acc_ledgers', 'acc_notes'];
const FILL = ['company_name', 'phone', 'whatsapp_phone', 'email', 'billing_address', 'shipping_address', 'gst_number', 'notes'];

const pool = new Pool({ connectionString: url.trim() });
const db = await pool.connect();
try {
  console.log('Database:', new URL(url.trim()).host, apply ? '(APPLY)' : '(dry run, will roll back)');
  await db.query('BEGIN');
  await db.query('CREATE TEMP TABLE merge_map (dup BIGINT PRIMARY KEY, keep BIGINT NOT NULL) ON COMMIT DROP');
  await db.query('INSERT INTO merge_map SELECT * FROM unnest($1::bigint[], $2::bigint[])', [dups, keeps]);
  await db.query('SELECT 1 FROM stock_customers WHERE id IN (SELECT dup FROM merge_map UNION SELECT keep FROM merge_map) FOR UPDATE');

  const { rows: bad } = await db.query(
    `SELECT m.dup, m.keep, d.name AS dup_name, k.name AS keep_name
     FROM merge_map m
     LEFT JOIN stock_customers d ON d.id = m.dup
     LEFT JOIN stock_customers k ON k.id = m.keep
     WHERE d.id IS NULL OR k.id IS NULL OR d.tenant_id <> k.tenant_id
        OR ${PHONE_KEY('d.phone')} IS DISTINCT FROM ${PHONE_KEY('k.phone')}`
  );
  if (bad.length) {
    console.table(bad);
    throw new Error(`${bad.length} pair(s) are missing, cross-tenant or no longer share a phone. Rebuild the plan.`);
  }

  // Enough to undo: the deleted rows, the kept rows before filling, and which
  // referencing row pointed at which duplicate.
  const backup = {
    taken_at: new Date().toISOString(),
    host: new URL(url.trim()).host,
    plan,
    customers: (await db.query('SELECT * FROM stock_customers WHERE id IN (SELECT dup FROM merge_map UNION SELECT keep FROM merge_map) ORDER BY id')).rows,
    refs: {},
  };
  for (const t of REFS) {
    backup.refs[t] = (await db.query(`SELECT id, customer_id FROM ${t} WHERE customer_id IN (SELECT dup FROM merge_map) ORDER BY id`)).rows;
  }
  await writeFile(backupPath, JSON.stringify(backup, null, 1));

  // All FILL columns are text.
  const firstNonBlank = (c) => `(array_agg(d.${c} ORDER BY d.id) FILTER (WHERE NULLIF(trim(d.${c}), '') IS NOT NULL))[1] AS ${c}`;
  const filled = await db.query(
    `UPDATE stock_customers k SET
       ${FILL.map((c) => `${c} = COALESCE(NULLIF(trim(k.${c}), ''), s.${c})`).join(',\n       ')},
       updated_at = NOW()
     FROM (SELECT m.keep, ${FILL.map(firstNonBlank).join(', ')}
           FROM merge_map m JOIN stock_customers d ON d.id = m.dup GROUP BY m.keep) s
     WHERE k.id = s.keep`
  );
  const moved = {};
  for (const t of REFS) {
    moved[t] = (await db.query(`UPDATE ${t} x SET customer_id = m.keep FROM merge_map m WHERE x.customer_id = m.dup`)).rowCount;
  }
  const deleted = (await db.query('DELETE FROM stock_customers c USING merge_map m WHERE c.id = m.dup')).rowCount;

  console.log({ groups: plan.length, kept_rows_updated: filled.rowCount, moved, deleted, backup: backupPath });
  await db.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(apply ? 'Committed.' : 'Rolled back (dry run). Re-run with --apply to keep it.');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  db.release();
  await pool.end();
}
