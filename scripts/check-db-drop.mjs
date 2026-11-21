// A database connection dropped mid-request must fail that request, not the
// process, and must not be handed to the next request (lib/db.js checkout()).
//   node --no-warnings --env-file=.env.local scripts/check-db-drop.mjs
import assert from 'node:assert/strict';
import { Pool } from '@neondatabase/serverless';
import { sql, withTenant } from '../lib/db.js';

const owner = new Pool({ connectionString: process.env.DATABASE_OWNER_URL });
const [{ id: tenantId }] = (await owner.query('SELECT MIN(id) AS id FROM tenants')).rows;

await assert.rejects(
  withTenant(tenantId, async () => {
    const [{ pid }] = await sql('SELECT pg_backend_pid() AS pid');
    await owner.query('SELECT pg_terminate_backend($1)', [pid]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await sql('SELECT 1');
    return new Response(null, { status: 200 });
  }),
  'a query on a killed connection should reject'
);

const response = await withTenant(tenantId, async () => {
  await sql('SELECT 1');
  return new Response(null, { status: 204 });
});
assert.equal(response.status, 204, 'the next request should get a working connection');

await owner.end();
console.log('check-db-drop: OK');
process.exit(0);
