/**
 * Delete punch selfies once they are past the retention window.
 *
 * This exists for the privacy reason, not the storage bill — the bill for these
 * is pennies either way. They are photographs of employees' faces, kept for one
 * narrow purpose (settling an attendance dispute), and nobody disputes a punch
 * from six months ago. Keeping them indefinitely is the thing to avoid.
 *
 * Runs nightly at 02:00 UTC. Deletes the blob first and only then clears the
 * key: the reverse order would leave a blob nothing points at, which is exactly
 * the thing this job exists to prevent. A row whose blob is already gone still
 * has its key cleared, so a failed delete is retried the next night rather than
 * being lost.
 */
import { neon } from '@neondatabase/serverless';
import { getStore } from '@netlify/blobs';
import { SELFIE_RETENTION_DAYS, SELFIE_STORE_NAME } from '../../lib/attendance.mjs';

// One night's work. The job is idempotent and runs daily, so a backlog (the
// first run after switching selfies on, say) drains over a few nights instead
// of risking the function's time limit in one go.
const BATCH = 500;

export default async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response('DATABASE_URL is not set', { status: 500 });
  }

  const sql = neon(databaseUrl);
  const store = getStore(SELFIE_STORE_NAME);

  const rows = await sql`
    SELECT id, in_selfie_key, out_selfie_key
      FROM stock_attendance_entries
     WHERE work_date < (CURRENT_DATE - ${SELFIE_RETENTION_DAYS}::int)
       AND (in_selfie_key IS NOT NULL OR out_selfie_key IS NOT NULL)
     ORDER BY work_date
     LIMIT ${BATCH}
  `;

  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    const keys = [row.in_selfie_key, row.out_selfie_key].filter(Boolean);

    const results = await Promise.allSettled(keys.map((key) => store.delete(key)));
    const stuck = results.filter((r) => r.status === 'rejected');
    if (stuck.length) {
      // Leave the keys in place so tonight's failure is retried tomorrow.
      failed += stuck.length;
      continue;
    }
    deleted += keys.length;

    await sql`
      UPDATE stock_attendance_entries
         SET in_selfie_key = NULL, out_selfie_key = NULL
       WHERE id = ${row.id}
    `;
  }

  const summary = `purge-selfies: ${deleted} deleted, ${failed} failed, ${rows.length} rows scanned (older than ${SELFIE_RETENTION_DAYS} days)`;
  console.log(summary);
  if (rows.length === BATCH) {
    console.log('purge-selfies: batch was full, the remainder goes tomorrow night');
  }
  return new Response(summary);
};

export const config = {
  name: 'purge-selfies',
  schedule: '0 2 * * *',
};
