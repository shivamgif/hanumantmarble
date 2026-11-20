import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from '@neondatabase/serverless';

// Cached on globalThis: Next.js HMR re-evaluates modules, and a new Pool per
// reload means a new TLS handshake on every local API hit.
if (!globalThis._neonPool) {
  globalThis._neonPool = new Pool({ connectionString: process.env.DATABASE_URL });
}
const pool = globalThis._neonPool;

// The request's tenant transaction (see withTenant). Every sql() call inside a
// request joins it; one outside any request goes to the pool, where RLS shows
// no tenant's rows: reads come back empty and writes are rejected.
if (!globalThis._dbScope) globalThis._dbScope = new AsyncLocalStorage();
const scope = globalThis._dbScope;

export async function sql(query, params = []) {
  if (typeof query !== 'string') {
    throw new Error('Query must be a string when calling sql(query, params)');
  }
  const current = scope.getStore();
  try {
    const { rows } = await (current?.client ?? pool).query(query, params);
    return rows;
  } catch (error) {
    // Postgres aborts the whole transaction after the first failed statement,
    // so every later query in this request fails with "current transaction is
    // aborted". Log the first one: that is the real cause.
    if (current && !current.failed) {
      current.failed = true;
      console.error('[db] first failed query in request transaction:', error.message, '\n', query.slice(0, 300));
    }
    throw error;
  }
}

/**
 * Run fn (a route handler) in one transaction scoped to a tenant. Commits when
 * fn returns a Response with status < 400, otherwise rolls back, so a handler
 * that writes and then answers 4xx/5xx leaves nothing half-done.
 */
export async function withTenant(tenantId, fn, { userEmail = '' } = {}) {
  const id = Number(tenantId);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid tenant id: ${tenantId}`);
  // One round trip for BEGIN + settings, so values are inlined: id is a checked
  // integer, the email is a SQL string literal ('' doubles a quote).
  const email = `'${String(userEmail ?? '').replace(/'/g, "''")}'`;

  const client = await pool.connect();
  try {
    // is_local = true: the settings die with this transaction, so a pooled
    // connection never carries one request's tenant into the next request.
    await client.query(
      `BEGIN; SELECT set_config('app.tenant_id', '${id}', true), set_config('app.user_email', ${email}, true)`
    );
    const response = await scope.run({ client, failed: false }, fn);
    if (response?.status < 400) {
      try {
        await client.query('COMMIT');
      } catch (error) {
        console.error('[db] commit failed:', error.message);
        return Response.json({ error: 'Could not save. Nothing was changed.', detail: error.message }, { status: 500 });
      }
    } else {
      await client.query('ROLLBACK');
    }
    return response;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * All-or-nothing block. Inside a request it is a savepoint in the request's
 * transaction; outside one (scripts) it is its own transaction.
 *
 * The voucher-balance check is a deferred constraint trigger. Forcing it at
 * the end of the block makes an unbalanced voucher fail here, inside the
 * handler, instead of at the request's COMMIT after a 200 was already built.
 */
export async function withTransaction(callback) {
  const current = scope.getStore();
  if (current) {
    const { client } = current;
    await client.query('SAVEPOINT tx');
    try {
      await client.query('SET CONSTRAINTS ALL DEFERRED');
      const result = await callback(sql);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await client.query('RELEASE SAVEPOINT tx');
      return result;
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT tx');
      await client.query('RELEASE SAVEPOINT tx');
      current.failed = false; // the savepoint undid the failure; the request can go on
      throw error;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await scope.run({ client, failed: false }, () => callback(sql));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
