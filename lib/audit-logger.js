import { sql } from '@/lib/db';

/**
 * Audit Logger for stock system
 * Logs all user actions for compliance and debugging
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
  try {
    // Extract IP address from request headers
    let ipAddress = 'unknown';
    if (request) {
      ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
    }

    const userAgent = request?.headers.get('user-agent') || null;

    await sql(
      `INSERT INTO stock_audit_logs (action, entityType, entityId, userId, userEmail, changes, details, ipAddress, userAgent)
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
        userAgent,
      ]
    );
  } catch (error) {
    console.error('Failed to log audit:', error);
    // Don't throw - audit logging should not break the main operation
  }
}

/**
 * Retrieve audit logs with filtering
 */
export async function getAuditLogs({
  action = null,
  entityType = null,
  userEmail = null,
  limit = 100,
  offset = 0,
}) {
  try {
    let query = 'SELECT * FROM stock_audit_logs WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (action) {
      query += ` AND action = $${paramCount++}`;
      params.push(action);
    }

    if (entityType) {
      query += ` AND entityType = $${paramCount++}`;
      params.push(entityType);
    }

    if (userEmail) {
      query += ` AND userEmail = $${paramCount++}`;
      params.push(userEmail);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limit, offset);

    return await sql(query, params);
  } catch (error) {
    console.error('Failed to retrieve audit logs:', error);
    return [];
  }
}
