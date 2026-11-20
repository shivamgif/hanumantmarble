// Tenant-isolation check. Run after every migration:
//
//   node --env-file=.env.local scripts/check-rls.mjs          catalog only (read-only; safe on prod)
//   node --env-file=.env.local scripts/check-rls.mjs --data   + leak tests as app_rw (all rolled back)
//
// DATABASE_OWNER_URL reads the catalog; DATABASE_URL must be the app_rw login.
// Exit code 1 on any failure.
import { Pool } from '@neondatabase/serverless';
import { sql, withTenant, withTransaction } from '../lib/db.js';

// Shared by every tenant on purpose: auth, the tenant list itself, migration log.
const GLOBAL_TABLES = new Set(['tenants', 'schema_migrations', 'user', 'session', 'account', 'verification']);
// The only cross-tenant doors (0001_tenancy.sql). A new one needs a review, not a quiet add.
const DEFINER_FUNCTIONS = new Set(['my_tenants', 'kiosk_device_tenant', 'selfie_purge_batch', 'clear_selfie_keys']);
// Unique on these alone is fine across tenants: random reference numbers and govt/auth ids.
const GLOBALLY_UNIQUE_COLUMN = (col) =>
  col === 'irn' || col === 'token_hash' || col.endsWith('_id') ||
  (col.endsWith('_number') && !['invoice_number', 'vehicle_number'].includes(col));

const failures = [];
const warnings = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl || !process.env.DATABASE_URL) throw new Error('Set DATABASE_OWNER_URL (owner) and DATABASE_URL (app_rw).');
const owner = new Pool({ connectionString: ownerUrl });
const q = async (text, params) => (await owner.query(text, params)).rows;

// ── Catalog ────────────────────────────────────────────────────────────────
const [role] = await q(`
  SELECT r.rolbypassrls, r.rolsuper,
         (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relowner = r.oid)::int AS owned,
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser') AS on_neon
    FROM pg_roles r WHERE r.rolname = 'app_rw'`);
check(role, 'role app_rw does not exist');
if (role) {
  check(!role.rolbypassrls && !role.rolsuper, 'app_rw bypasses RLS');
  check(role.owned === 0, `app_rw owns ${role.owned} objects (owners are exempt from RLS)`);
  if (role.on_neon) {
    const [{ member }] = await q(`SELECT pg_has_role('app_rw', 'neon_superuser', 'member') AS member`);
    check(!member, 'app_rw is a neon_superuser member');
  }
}
const [{ app_user: appUser }] = (await sql('SELECT current_user AS app_user'));
check(appUser === 'app_rw', `DATABASE_URL logs in as ${appUser}, not app_rw`);

const tables = await q(`
  SELECT c.relname AS name, c.relrowsecurity AS rls,
         (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS policies,
         (SELECT a.attnotnull FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS tenant_not_null
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
   ORDER BY 1`);
const tenantTables = tables.filter((t) => !GLOBAL_TABLES.has(t.name)).map((t) => t.name);
for (const t of tables) {
  if (GLOBAL_TABLES.has(t.name)) continue;
  check(t.tenant_not_null === true, `${t.name}: no NOT NULL tenant_id`);
  check(t.rls, `${t.name}: row level security is off`);
  check(t.policies > 0, `${t.name}: no policy`);
}
check(tables.find((t) => t.name === 'tenants')?.rls, 'tenants: row level security is off');

for (const v of await q(`
  SELECT c.relname AS name, COALESCE(c.reloptions, '{}') AS options
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'`)) {
  check(v.options.includes('security_invoker=true'), `view ${v.name}: not security_invoker (runs as owner, skips RLS)`);
}

for (const f of await q(`
  SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef`)) {
  check(DEFINER_FUNCTIONS.has(f.name), `SECURITY DEFINER function ${f.name} is not on the reviewed list`);
}

const transitional = !(await q(`SELECT 1 FROM schema_migrations WHERE name LIKE '0002%'`)).length;
for (const ix of await q(`
  SELECT ic.relname AS index, tc.relname AS "table",
         ARRAY(SELECT a.attname::text FROM unnest(i.indkey) k JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k) AS cols
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
   WHERE n.nspname = 'public' AND i.indisunique AND NOT i.indisprimary`)) {
  if (GLOBAL_TABLES.has(ix.table) || ix.cols.includes('tenant_id') || ix.cols.some(GLOBALLY_UNIQUE_COLUMN)) continue;
  const message = `${ix.table}: unique ${ix.index} (${ix.cols.join(', ')}) is global, not per tenant`;
  // Kept until 0002 so the previous deploy can still run against this schema.
  if (transitional) warnings.push(message); else failures.push(message);
}

// ── Data: everything below runs as app_rw and is rolled back ───────────────
if (process.argv.includes('--data')) {
  const A = 900001;
  const B = 900002;
  const setTenant = (id) => sql(`SELECT set_config('app.tenant_id', $1, true)`, [String(id)]);
  const errorCode = async (fn) => {
    try { await withTransaction(fn); return null; } catch (error) { return error.code || error.message; }
  };

  const result = await withTenant(A, async () => {
    await sql(`INSERT INTO tenants (id, name) VALUES ($1, 'rls-probe-A')`, [A]);
    const [brand] = await sql(`INSERT INTO stock_brands (name) VALUES ('rls-probe') RETURNING id, tenant_id`);
    check(brand.tenant_id === A, `insert under tenant A got tenant_id ${brand.tenant_id}`);
    const [business] = await sql(
      `INSERT INTO stock_businesses (legal_name, gstin, state_code, invoice_prefix)
       VALUES ('rls-probe', '99ZZZZZ9999Z9Z9', '99', 'ZZ9') RETURNING id`
    );

    // An unbalanced voucher must fail inside the block that wrote it.
    const [ledger] = await sql(
      `INSERT INTO acc_ledgers (business_id, name, group_name) VALUES ($1, 'rls-probe', 'Sundry Debtors') RETURNING id`,
      [business.id]
    );
    const unbalanced = await errorCode(async (tx) => {
      const [v] = await tx(
        `INSERT INTO acc_vouchers (business_id, voucher_type, voucher_date, fiscal_year) VALUES ($1, 'journal', '2099-01-01', '2098-99') RETURNING id`,
        [business.id]
      );
      await tx(`INSERT INTO acc_voucher_lines (voucher_id, ledger_id, amount) VALUES ($1, $2, 100)`, [v.id, ledger.id]);
    });
    check(String(unbalanced).includes('P0001') || /balance/i.test(String(unbalanced)),
      `unbalanced voucher was not rejected inside withTransaction (got ${unbalanced})`);

    await setTenant(B);
    await sql(`INSERT INTO tenants (id, name) VALUES ($1, 'rls-probe-B')`, [B]);
    for (const table of tenantTables) {
      const [{ n }] = await sql(`SELECT COUNT(*)::int AS n FROM ${table}`);
      check(n === 0, `tenant B sees ${n} rows of ${table}`);
    }
    const [{ n: tenantRows }] = await sql('SELECT COUNT(*)::int AS n FROM tenants');
    check(tenantRows === 1, `tenant B sees ${tenantRows} tenants rows`);
    check((await sql(`UPDATE stock_brands SET name = 'pwned' WHERE id = $1 RETURNING id`, [brand.id])).length === 0, 'tenant B updated tenant A\'s brand');
    check((await sql(`DELETE FROM stock_brands WHERE id = $1 RETURNING id`, [brand.id])).length === 0, 'tenant B deleted tenant A\'s brand');
    const forged = await errorCode((tx) => tx(`INSERT INTO stock_brands (tenant_id, name) VALUES ($1, 'forged')`, [A]));
    check(forged === '42501', `tenant B wrote a row for tenant A (got ${forged})`);
    const sameName = await errorCode((tx) => tx(`INSERT INTO stock_brands (name) VALUES ('rls-probe')`));
    if (sameName !== null) {
      const message = `tenant B cannot reuse tenant A's brand name (got ${sameName})`;
      if (transitional && sameName === '23505') warnings.push(`${message}: expected until 0002 drops the global uniques`);
      else failures.push(message);
    }

    await setTenant('');
    const [{ n: unscoped }] = await sql('SELECT COUNT(*)::int AS n FROM stock_brands');
    check(unscoped === 0, `no tenant set, yet ${unscoped} brands are visible`);
    const orphan = await errorCode((tx) => tx(`INSERT INTO stock_brands (name) VALUES ('orphan')`));
    check(orphan === '42501', `insert with no tenant set was not rejected (got ${orphan})`);

    return new Response(null, { status: 418 }); // >= 400: roll all of it back
  });
  check(result.status === 418, 'probe transaction did not run');
  check((await q(`SELECT 1 FROM tenants WHERE id IN ($1, $2)`, [A, B])).length === 0, 'probe tenants survived the rollback');

  // A 4xx answer rolls back what the handler wrote; a failed nested block only undoes itself.
  const probeTenant = Number((await q('SELECT MIN(id) AS id FROM tenants'))[0].id);
  await withTenant(probeTenant, async () => {
    await sql(`INSERT INTO stock_brands (name) VALUES ('rls-probe-outer')`);
    await errorCode(async (tx) => {
      await tx(`INSERT INTO stock_brands (name) VALUES ('rls-probe-inner')`);
      throw new Error('inner block fails');
    });
    const names = (await sql(`SELECT name FROM stock_brands WHERE name LIKE 'rls-probe-%' ORDER BY name`)).map((r) => r.name);
    check(names.join() === 'rls-probe-outer', `after a failed nested block saw [${names}], expected [rls-probe-outer]`);
    return new Response(null, { status: 400 });
  });
  check((await q(`SELECT 1 FROM stock_brands WHERE name LIKE 'rls-probe-%'`)).length === 0, 'a 400 response did not roll back its writes');
}

await owner.end();
for (const w of warnings) console.log(`WARN  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(failures.length ? `check-rls: ${failures.length} failure(s)` : `check-rls: OK (${tenantTables.length} tenant tables)`);
process.exit(failures.length ? 1 : 0);
