import { sql } from '@/lib/db';

/**
 * App-level audit entry for actions the row triggers don't describe well
 * (e.g. a showroom move's human-readable label). Row changes on books and
 * shipments are already logged by the audit_row_change() trigger.
 *
 * Throws on failure: inside a request transaction a failed insert aborts the
 * whole request anyway, so swallowing it would only hide the cause.
 */
export async function logAudit({
  action,
  entityType,
  entityId,
  userId,
  userEmail,
  changes = null,
  details = null,
  request = null,
}) {
  const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request?.headers.get('x-real-ip')
    || 'unknown';

  await sql(
    `INSERT INTO stock_audit_logs (action, entity_type, entity_id, user_id, user_email, changes, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      action,
      entityType,
      entityId,
      userId,
      userEmail,
      changes ? JSON.stringify(changes) : null,
      details,
      ipAddress,
      request?.headers.get('user-agent') || null,
    ]
  );
}
