import crypto from 'crypto';
import { auth } from '@/lib/auth-server';
import { sql, withTenant } from '@/lib/db';
import { canSell, getRoleFlags, normalizeStockRole, STOCK_ROLES } from '@/lib/stock-roles.mjs';
import { TENANT_COOKIE } from '@/lib/tenant-cookie';
import { NAME_KEY, PHONE_KEY, phoneKey } from '@/lib/stock-customer-match.mjs';

export { canSell, getRoleFlags, normalizeStockRole, STOCK_ROLES, TENANT_COOKIE };

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

// Session per request, so stockRoute and getStockContext ask better-auth once.
const requestSessions = new WeakMap();

async function sessionFor(request) {
  if (!requestSessions.has(request)) requestSessions.set(request, await auth.getSession(request));
  return requestSessions.get(request);
}


const TENANTS_TTL_MS = 60_000;

/**
 * Tenants this signed-in person has a staff row in (my_tenants() in
 * 0001_tenancy.sql). Cached briefly: it only picks which tenant's rows a
 * request opens. Access itself is decided per request by getStockContext,
 * under RLS, so a removed staff row locks the person out at once.
 */
export async function tenantsFor(session) {
  const key = `${session.user.sub}|${session.user.email || ''}|${session.user.emailVerified === true}`;
  const cache = (globalThis._tenantsForCache ??= new Map());
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.tenants;

  const rows = await sql('SELECT tenant_id, tenant_name FROM my_tenants($1, $2, $3)', [
    session.user.sub,
    session.user.email || '',
    session.user.emailVerified === true,
  ]);
  const tenants = rows.map((row) => ({ id: Number(row.tenant_id), name: row.tenant_name }));
  if (cache.size > 5000) cache.clear(); // ponytail: crude bound; one lambda never sees that many users
  cache.set(key, { tenants, expiresAt: Date.now() + TENANTS_TTL_MS });
  return tenants;
}

// Which tenant each request opened (set by stockRoute), for /api/stock/access.
const requestTenants = new WeakMap();

/** { tenant: { id, name } | null, tenants: [...] } for a request stockRoute handled. */
export function requestTenant(request) {
  return requestTenants.get(request) ?? { tenant: null, tenants: [] };
}

/** The same rule the stock UI uses to let someone in (useStockAccess → approved). */
export function isApprovedStaff(appUser) {
  return Boolean(appUser && appUser.status === 'active' && appUser.can_view_dashboard);
}

/**
 * Wrap a /api/stock route handler: resolve the caller's tenant, run the
 * handler in one transaction scoped to it (lib/db.js withTenant), and only for
 * an approved staff member of that tenant.
 *
 * No session: 401. Signed in but not approved staff here (no row, inactive, or
 * no dashboard access): 403. Both before the handler runs, so no route can
 * forget either check.
 * `allowUnapproved` is for /api/stock/access only, which tells such people
 * where they stand.
 */
export function stockRoute(handler, { allowUnapproved = false } = {}) {
  return async (request, context) => {
    const session = await sessionFor(request);
    if (!session) {
      return allowUnapproved ? handler(request, context) : Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenants = await tenantsFor(session);
    const wanted = Number(request.cookies?.get(TENANT_COOKIE)?.value);
    const tenant = tenants.find((t) => t.id === wanted) ?? tenants[0] ?? null;
    requestTenants.set(request, { tenant, tenants });
    const forbidden = () => Response.json({ error: 'Forbidden' }, { status: 403 });

    if (!tenant) return allowUnapproved ? handler(request, context) : forbidden();
    return withTenant(tenant.id, async () => {
      if (!allowUnapproved && !isApprovedStaff((await getStockContext(request)).appUser)) return forbidden();
      return handler(request, context);
    }, { userEmail: session.user.email });
  };
}

// One staff lookup per request, however many helpers ask (stockRoute, guards).
const requestContexts = new WeakMap();

export async function getStockContext(request) {
  if (!requestContexts.has(request)) requestContexts.set(request, loadStockContext(request));
  return requestContexts.get(request);
}

async function loadStockContext(request) {
  const session = await sessionFor(request);

  if (!session) {
    return { session: null, appUser: null };
  }

  // Email only identifies someone once the auth provider has verified it;
  // otherwise signing up with a pre-added staff email would claim that row.
  const rows = await sql(
    `SELECT *
     FROM stock_app_users
     WHERE auth0_sub = $1 OR ($3 AND email = $2)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [session.user.sub, session.user.email, session.user.emailVerified === true]
  );

  const appUser = rows[0] || null;
  if (appUser && normalizeStockRole(appUser.role) === 'salesperson') {
    const divRows = await sql(
      `SELECT division_id FROM stock_user_divisions WHERE user_id = $1 ORDER BY division_id`,
      [appUser.id]
    );
    appUser.division_ids = divRows.map((r) => Number(r.division_id));
  }
  return { session, appUser };
}

// Both success and failure verdicts are cached with a TTL so we don't hammer
// the DB on every request, but also never serve an indefinitely-stale "true".
const DB_AVAILABLE_TRUE_TTL_MS = 30_000;
const DB_AVAILABLE_FALSE_TTL_MS = 60_000;

function readCachedDbAvailable() {
  const entry = globalThis._dbAvailableStatus;
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.expiresAt !== 'number' || Date.now() >= entry.expiresAt) return null;
  return entry.value;
}

function writeCachedDbAvailable(value, ttlMs) {
  globalThis._dbAvailableStatus = { value, expiresAt: Date.now() + ttlMs };
}

export function invalidateDatabaseAvailableCache() {
  globalThis._dbAvailableStatus = null;
}

export async function ensureDatabaseAvailable() {
  const cached = readCachedDbAvailable();
  if (cached !== null) return cached;

  try {
    await sql('SELECT 1');
    writeCachedDbAvailable(true, DB_AVAILABLE_TRUE_TTL_MS);
    return true;
  } catch (error) {
    writeCachedDbAvailable(false, DB_AVAILABLE_FALSE_TTL_MS);
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
     ON CONFLICT (tenant_id, ${column}) DO UPDATE SET ${updates}, updated_at = NOW()
     RETURNING *`,
    params
  );

  return rows[0];
}

/**
 * The names already saved for a phone number, most-dispatched first, for the
 * dispatch and estimate forms to suggest once a number is typed.
 */
export async function customerNamesForPhone(phone) {
  if (phoneKey(phone).length < 10) return [];
  const rows = await sql(
    `SELECT c.name
     FROM stock_customers c
     LEFT JOIN stock_outbound_shipments o ON o.customer_id = c.id
     WHERE ${PHONE_KEY('c.phone')} = ${PHONE_KEY('$1')} AND NULLIF(trim(c.name), '') IS NOT NULL
     GROUP BY c.id, c.name
     ORDER BY COUNT(o.id) DESC, c.id
     LIMIT 10`,
    [String(phone)]
  );
  return [...new Set(rows.map((r) => r.name.trim().replace(/\s+/g, ' ')))];
}

/**
 * A customer by name + phone (or by name alone when no phone is given), created
 * if new. Phone formats, case and repeated spaces are ignored, so the same
 * customer typed slightly differently is reused; a different name on a known
 * number is a different customer (one contractor's phone can front several
 * clients). The forms suggest the names already saved for a number, which is
 * what keeps accidental near-duplicates out. Pass `db` to run inside a
 * transaction. Returns the shape the dispatch route has always used:
 * customer_id, customer_name, ...
 */
export async function findOrCreateCustomer(name, phone, db = sql) {
  const trimmedName = String(name || '').trim().replace(/\s+/g, ' ');
  const trimmedPhone = String(phone || '').trim() || null;
  const columns = `id AS customer_id, name AS customer_name, phone AS customer_phone,
              whatsapp_phone AS customer_whatsapp_phone, email AS customer_email`;

  // ponytail: regex on every row, no index. Add expression indexes on
  // PHONE_KEY('phone') / NAME_KEY('name') if stock_customers grows past tens of thousands.
  const existing = trimmedPhone
    ? await db(
      `SELECT ${columns}
       FROM stock_customers
       WHERE ${NAME_KEY('name')} = ${NAME_KEY('$1')} AND ${PHONE_KEY('phone')} = ${PHONE_KEY('$2')}
       ORDER BY id
       LIMIT 1`,
      [trimmedName, trimmedPhone]
    )
    : await db(
      `SELECT ${columns}
       FROM stock_customers
       WHERE ${NAME_KEY('name')} = ${NAME_KEY('$1')}
       ORDER BY id
       LIMIT 1`,
      [trimmedName]
    );
  if (existing[0]) return existing[0];

  const created = await db(
    `INSERT INTO stock_customers (name, phone)
     VALUES ($1, $2)
     RETURNING id AS customer_id, name AS customer_name, phone AS customer_phone,
               NULL AS customer_whatsapp_phone, NULL AS customer_email`,
    [trimmedName, trimmedPhone]
  );
  return created[0];
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

export async function collectNotificationRecipients(divisionIds = null) {
  try {
    const [appUsers, salesPeople] = await Promise.all([
      sql(
        divisionIds && divisionIds.length > 0
          ? `SELECT name, phone, email, role
             FROM stock_app_users
             WHERE status = 'active'
             AND (role IN ('admin','manager','stock_maintainer')
                  OR (role = 'salesperson' AND EXISTS (
                    SELECT 1 FROM stock_user_divisions sud
                    WHERE sud.user_id = stock_app_users.id AND sud.division_id = ANY($1)
                  )))`
          : `SELECT name, phone, email, role
             FROM stock_app_users
             WHERE status = 'active'`,
        divisionIds && divisionIds.length > 0 ? [divisionIds] : []
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
