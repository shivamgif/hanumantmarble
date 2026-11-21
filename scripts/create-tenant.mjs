// Onboard a new company (tenant). Operator-only: runs with the owner login,
// because no tenant exists yet for the app's app_rw role to act inside.
//
//   node --env-file=.env.local scripts/create-tenant.mjs \
//     --name "Sharma Traders" --owner-email owner@sharma.in --owner-name "R. Sharma" \
//     [--gstin 27ABCDE1234F1Z5 --legal-name "Sharma Traders Pvt Ltd" --invoice-prefix ST]
//
//   ... --verify-email owner@sharma.in
//       Vouch for an email/password sign-up. The app sends no verification
//       mail, and an unverified email never matches a staff row (it would let
//       anyone claim a pre-added address). Google sign-ins are verified already.
//
// Production: npm run db:migrate:prod scripts/create-tenant.mjs -- <same flags>
import { parseArgs } from 'node:util';
import { Pool } from '@neondatabase/serverless';
import { isValidGstin } from '../lib/gst-invoice.mjs';

const { values: args } = parseArgs({
  options: {
    name: { type: 'string' },
    'owner-email': { type: 'string' },
    'owner-name': { type: 'string' },
    'owner-phone': { type: 'string' },
    gstin: { type: 'string' },
    'legal-name': { type: 'string' },
    'invoice-prefix': { type: 'string' },
    'verify-email': { type: 'string' },
  },
});

const isUrl = (value) => /^postgres(ql)?:\/\//.test(String(value || '').trim());
const configured = [process.env.DATABASE_OWNER_URL, process.env.DATABASE_URL].find(isUrl);
if (!configured) throw new Error('Set DATABASE_OWNER_URL to the owner connection string.');
const pool = new Pool({ connectionString: configured.trim() });
const client = await pool.connect();

try {
  const { rows: [{ user }] } = await client.query('SELECT current_user AS user');
  if (user === 'app_rw') throw new Error('Connected as app_rw. Set DATABASE_OWNER_URL to the owner connection string.');

  if (args['verify-email']) {
    const email = args['verify-email'].trim().toLowerCase();
    const { rows } = await client.query(
      `UPDATE "user" SET "emailVerified" = true, "updatedAt" = NOW() WHERE lower(email) = $1 RETURNING id`,
      [email]
    );
    console.log(rows.length ? `Verified ${email}.` : `No account for ${email} yet: ask them to sign up first, then rerun.`);
  } else {
    const name = String(args.name || '').trim();
    const ownerEmail = String(args['owner-email'] || '').trim().toLowerCase();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
      throw new Error('Required: --name "<company>" --owner-email <email>');
    }
    const gstin = args.gstin ? args.gstin.trim().toUpperCase() : null;
    if (gstin && !isValidGstin(gstin)) throw new Error(`Not a valid GSTIN: ${gstin}`);
    const prefix = String(args['invoice-prefix'] || '').trim().toUpperCase();
    if (gstin && !/^[A-Z0-9]{1,4}$/.test(prefix)) throw new Error('--invoice-prefix (1-4 letters/digits) is required with --gstin');

    await client.query('BEGIN');
    const { rows: [tenant] } = await client.query('INSERT INTO tenants (name) VALUES ($1) RETURNING id', [name]);
    // Every row below defaults its tenant_id from this setting.
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(tenant.id)]);
    await client.query('INSERT INTO stock_attendance_settings DEFAULT VALUES');
    if (gstin) {
      await client.query(
        `INSERT INTO stock_businesses (legal_name, trade_name, gstin, state_code, invoice_prefix)
         VALUES ($1, $2, $3, $4, $5)`,
        [args['legal-name']?.trim() || name, name, gstin, gstin.slice(0, 2), prefix]
      );
    }
    // manager: the one role that adds staff, so the owner can bring in the rest.
    await client.query(
      `INSERT INTO stock_app_users
         (name, phone, email, role, status, can_manage_users, can_approve_changes, can_view_dashboard, created_by)
       VALUES ($1, $2, $3, 'manager', 'active', TRUE, TRUE, TRUE, 'operator')`,
      [args['owner-name']?.trim() || ownerEmail, args['owner-phone']?.trim() || 'Not provided', ownerEmail]
    );
    await client.query('COMMIT');

    console.log(`Created tenant ${tenant.id} "${name}"${gstin ? ` with GSTIN ${gstin}` : ''}; owner ${ownerEmail} is its manager.`);
    console.log('Next: the owner signs in with that email (Google, or email/password followed by --verify-email),');
    console.log('then adds branches in Admin → Branches and staff in Admin → Users.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
