import crypto from 'crypto';
import { auth0 } from '@/lib/auth0';
import { sql } from '@/lib/db';

export const STOCK_ROLES = ['admin', 'manager', 'stock_maintainer', 'salesperson'];

export function normalizeStockRole(role) {
  const rawRole = normalizeText(role).toLowerCase();

  if (rawRole === 'admin') return 'admin';
  if (rawRole === 'manager' || rawRole === 'stock_approver') return 'manager';
  if (rawRole === 'salesperson' || rawRole === 'sales_person' || rawRole === 'sales') return 'salesperson';
  return 'stock_maintainer';
}

export function getRoleFlags(role) {
  const normalizedRole = normalizeStockRole(role);

  return {
    role: normalizedRole,
    canManageUsers: normalizedRole === 'admin' || normalizedRole === 'manager',
    canApproveChanges: normalizedRole === 'admin' || normalizedRole === 'manager',
    canViewDashboard: true,
    canCreateDispatch: normalizedRole === 'admin' || normalizedRole === 'manager' || normalizedRole === 'stock_maintainer' || normalizedRole === 'salesperson',
    isReadOnly: normalizedRole === 'salesperson',
    canApprove: normalizedRole === 'admin' || normalizedRole === 'manager',
  };
}

export function hasAnyStockRole(appUser, allowedRoles = []) {
  if (!appUser) return false;
  return allowedRoles.includes(normalizeStockRole(appUser.role));
}

export function generateReference(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${suffix}`;
}

export function normalizeText(value) {
  return value ? String(value).trim().replace(/\s+/g, ' ') : '';
}

export async function getStockContext(request) {
  const session = await auth0.getSession(request);

  if (!session) {
    return { session: null, appUser: null };
  }

  try {
    const rows = await sql(
      `SELECT *
       FROM stock_app_users
       WHERE auth0_sub = $1 OR email = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [session.user.sub, session.user.email]
    );

    return { session, appUser: rows[0] || null };
  } catch (error) {
    return { session, appUser: null };
  }
}

export async function ensureDatabaseAvailable() {
  try {
    await sql('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
}

export async function upsertNamedRecord({ table, column = 'name', value, extra = {} }) {
  const cleanValue = normalizeText(value);

  if (!cleanValue) {
    throw new Error(`Missing value for ${table}.${column}`);
  }

  const fields = [column, ...Object.keys(extra)];
  const params = [cleanValue, ...Object.values(extra)];
  const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
  const updates = fields.map((field) => `${field} = EXCLUDED.${field}`).join(', ');

  const rows = await sql(
    `INSERT INTO ${table} (${fields.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (${column}) DO UPDATE SET ${updates}, updated_at = NOW()
     RETURNING *`,
    params
  );

  return rows[0];
}

export async function recordTimelineEvent({
  eventType,
  entityType,
  entityId,
  summary,
  details = null,
  userId = null,
}) {
  const rows = await sql(
    `INSERT INTO stock_timeline_events (event_number, event_type, entity_type, entity_id, recorded_by_user_id, summary, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [generateReference('EVT'), eventType, entityType, entityId || null, userId, summary, details ? JSON.stringify(details) : null]
  );

  return rows[0];
}

export async function queueNotification({
  channel = 'whatsapp',
  eventType,
  messageText,
  recipients = [],
  sourceTable = null,
  sourceId = null,
  createdBy = null,
}) {
  const rows = await sql(
    `INSERT INTO stock_notifications (
      notification_number,
      channel,
      event_type,
      recipients,
      message_text,
      status,
      source_table,
      source_id,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      generateReference('NTF'),
      channel,
      eventType,
      JSON.stringify(recipients),
      messageText,
      'queued',
      sourceTable,
      sourceId,
      createdBy,
    ]
  );

  return rows[0];
}

export async function collectNotificationRecipients() {
  try {
    const [appUsers, salesPeople] = await Promise.all([
      sql(
        `SELECT name, phone, email, role
         FROM stock_app_users
         WHERE status = 'active'`,
        []
      ),
      sql(
        `SELECT name, phone, whatsapp_phone, email
         FROM stock_sales_people
         WHERE is_active = TRUE`,
        []
      ),
    ]);

    return [
      ...appUsers.map((user) => ({
        kind: 'user',
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      })),
      ...salesPeople.map((person) => ({
        kind: 'sales_person',
        name: person.name,
        phone: person.phone,
        whatsapp_phone: person.whatsapp_phone,
        email: person.email,
      })),
    ];
  } catch (error) {
    return [];
  }
}

export function bufferToDataUrl(buffer, mimeType) {
  const safeMimeType = mimeType || 'application/octet-stream';
  return `data:${safeMimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

export async function readUploadFile(uploadedFile) {
  const arrayBuffer = await uploadedFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    dataUrl: bufferToDataUrl(buffer, uploadedFile.type),
    fileName: uploadedFile.name,
    mimeType: uploadedFile.type || 'application/octet-stream',
    fileSizeBytes: buffer.length,
    checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

export async function insertStockDocument({
  documentType,
  entityType,
  entityId,
  fileName,
  fileUrl,
  mimeType,
  fileSizeBytes,
  checksum,
  notes = null,
  createdBy = null,
  documentNumber = null,
}) {
  const rows = await sql(
    `INSERT INTO stock_documents (
      document_number,
      document_type,
      entity_type,
      entity_id,
      file_name,
      file_url,
      mime_type,
      file_size_bytes,
      checksum,
      notes,
      created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *`,
    [
      documentNumber,
      documentType,
      entityType,
      entityId || null,
      fileName,
      fileUrl,
      mimeType,
      fileSizeBytes,
      checksum,
      notes,
      createdBy,
    ]
  );

  return rows[0];
}

export async function linkDocumentToEntity({ document, documentType, entityType, entityId, documentNumber }) {
  if (entityType === 'inbound_shipment') {
    if (documentType === 'purchase_invoice') {
      await sql(
        `UPDATE stock_inbound_shipments
         SET invoice_document_id = $1,
             invoice_number = COALESCE($2, invoice_number),
             updated_at = NOW()
         WHERE id = $3`,
        [document.id, documentNumber || null, entityId]
      );
    }

    if (documentType === 'transporter_bill') {
      await sql(
        `UPDATE stock_inbound_shipments
         SET transporter_bill_document_id = $1,
             transporter_bill_number = COALESCE($2, transporter_bill_number),
             updated_at = NOW()
         WHERE id = $3`,
        [document.id, documentNumber || null, entityId]
      );
    }
  }

  if (entityType === 'outbound_shipment') {
    if (documentType === 'gatepass') {
      await sql(
        `UPDATE stock_outbound_shipments
         SET gatepass_document_id = $1,
             gatepass_number = COALESCE($2, gatepass_number),
             updated_at = NOW()
         WHERE id = $3`,
        [document.id, documentNumber || null, entityId]
      );
    }

    if (documentType === 'sales_invoice') {
      await sql(
        `UPDATE stock_outbound_shipments
         SET invoice_document_id = $1,
             invoice_number = COALESCE($2, invoice_number),
             updated_at = NOW()
         WHERE id = $3`,
        [document.id, documentNumber || null, entityId]
      );
    }

    if (documentType === 'delivery_receipt' || documentType === 'customer_acknowledgement') {
      const ackRows = await sql(
        `INSERT INTO stock_customer_acknowledgements (
          outbound_shipment_id,
          acknowledgement_status,
          acknowledged_at,
          photo_url,
          notes
        ) VALUES ($1, 'received', NOW(), $2, $3)
        RETURNING *`,
        [entityId, document.file_url, document.notes || null]
      );

      await sql(
        `UPDATE stock_outbound_shipments
         SET customer_acknowledgement_id = $1,
             customer_acknowledged_at = COALESCE(customer_acknowledged_at, NOW()),
             updated_at = NOW()
         WHERE id = $2`,
        [ackRows[0].id, entityId]
      );
    }
  }

  return document;
}
