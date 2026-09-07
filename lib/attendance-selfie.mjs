// Punch selfies. The bytes live in a Netlify blob store, NEVER in Postgres —
// stock_attendance_entries only holds a ~40 byte key. Two reasons:
//
//   1. Every hot query on that table is `SELECT *` (punch/route.js, kiosk,
//      attendance-db.getOpenEntry). A bytea column would drag 50KB back on
//      every punch and every timesheet row for no reason.
//   2. Blobs bloat WAL and every backup, forever, at Neon storage prices.
//
// The images are employee faces, so nothing here is public: reading one goes
// through /api/stock/attendance/selfie/[id], which re-checks who is asking, and
// the scheduled purge in netlify/functions/purge-selfies.mjs deletes them after
// SELFIE_RETENTION_DAYS. Keeping faces forever is the thing to avoid, not the
// storage bill — that stays trivial either way.
import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';
import { SELFIE_RETENTION_DAYS, SELFIE_STORE_NAME } from './attendance.mjs';

// .mjs, and the import above is relative, so `node` can load this file directly
// — that is what lets lib/attendance.test.mjs exercise decodeSelfie(), the one
// piece here that is a trust boundary.
//
// Re-exported so route files keep a single attendance-selfie import. The values
// live in the pure module because the nightly purge runs outside Next.js and
// needs the same store name and window.
export { SELFIE_RETENTION_DAYS, SELFIE_STORE_NAME };

// The client resizes to 640px / q0.7, which lands around 40-60KB. This cap is
// the trust boundary, not the target: it rejects a hand-rolled request trying
// to park a few megabytes per punch.
const MAX_BYTES = 300 * 1024;

/**
 * The blob store, or null when the environment has no Netlify Blobs credentials
 * — plain `next dev` without the Netlify CLI, mainly. Callers treat null the
 * same way they treat a denied GPS prompt: record the punch, skip the extra.
 */
export function selfieStore() {
  try {
    return getStore(SELFIE_STORE_NAME);
  } catch {
    return null;
  }
}

/**
 * Bytes from the `data:image/jpeg;base64,...` string the client sends, or null
 * if it is anything else.
 *
 * JPEG only, and the magic bytes are checked rather than the declared type: the
 * body comes from a browser we do not control, and the read route serves these
 * bytes back to a manager. Length is checked BEFORE decoding so an oversized
 * payload is rejected without allocating it.
 */
export function decodeSelfie(value) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value || ''));
  if (!match) return null;

  // base64 is 4 chars per 3 bytes; bail before Buffer.from allocates.
  if (match[1].length > Math.ceil(MAX_BYTES / 3) * 4) return null;

  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 3 || bytes.length > MAX_BYTES) return null;
  // SOI marker. A PNG/SVG/HTML payload relabelled as JPEG fails here.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;

  return bytes;
}

/**
 * Store one selfie and return its key, or null if it could not be stored.
 *
 * Never throws. A punch is the employee's pay; it must not fail because a blob
 * write did. The caller logs the miss and carries on with a null key.
 */
export async function putSelfie(bytes, { userId, action }) {
  const store = selfieStore();
  if (!store || !bytes) return null;

  // Date prefix so a human can eyeball the store, uuid so keys are unguessable
  // even though the read route authorises by entry id rather than by key.
  const key = `${new Date().toISOString().slice(0, 10)}/${userId}-${action}-${randomUUID()}.jpg`;
  try {
    await store.set(key, bytes, { metadata: { userId: String(userId), action } });
    return key;
  } catch (error) {
    console.error('[attendance] selfie upload failed:', error.message);
    return null;
  }
}
