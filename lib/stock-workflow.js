import crypto from 'crypto';
import { after } from 'next/server';
import { auth } from '@/lib/auth-server';
import { sql, withTenant, withTransaction } from '@/lib/db';
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
 * Saved customers for the dispatch and estimate forms to suggest, most-dispatched
 * first: those on a phone number, or, while the number has none, those whose
 * name contains what has been typed.
 */
export async function customerSuggestions({ phone, name }) {
  const byPhone = phone != null;
  const needle = String(name ?? '').trim();
  if (byPhone ? phoneKey(phone).length < 10 : needle.length < 2) return [];
  const rows = await sql(
    `SELECT c.id, c.name, c.phone
     FROM stock_customers c
     LEFT JOIN stock_outbound_shipments o ON o.customer_id = c.id
     WHERE NULLIF(trim(c.name), '') IS NOT NULL
       AND ${byPhone ? `${PHONE_KEY('c.phone')} = ${PHONE_KEY('$1')}` : `strpos(${NAME_KEY('c.name')}, ${NAME_KEY('$1')}) > 0`}
     GROUP BY c.id
     ORDER BY COUNT(o.id) DESC, c.id
     LIMIT 10`,
    [byPhone ? String(phone) : needle]
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name.trim().replace(/\s+/g, ' '), phone: r.phone || null }));
}

/**
 * A customer by name + phone (or by name alone when no phone is given), created
 * if new. Phone formats, case and repeated spaces are ignored, so the same
 * customer typed slightly differently is reused; a different name on a known
 * number is a different customer (one contractor's phone can front several
 * clients). The forms suggest the names already saved for a number, which is
 * what keeps accidental near-duplicates out. `id`: a customer picked from
 * those suggestions, used as-is (same name on a new number, for one). `db`:
 * run inside a transaction. Returns the shape the dispatch route has always
 * used: customer_id, customer_name, ...
 */
export async function findOrCreateCustomer(name, phone, { db = sql, id = null } = {}) {
  const trimmedName = String(name || '').trim().replace(/\s+/g, ' ');
  const trimmedPhone = String(phone || '').trim() || null;
  const columns = `id AS customer_id, name AS customer_name, phone AS customer_phone,
              whatsapp_phone AS customer_whatsapp_phone, email AS customer_email`;

  if (Number(id) > 0) {
    // RLS keeps this to the caller's tenant; an id that is gone falls through to matching.
    const picked = await db(`SELECT ${columns} FROM stock_customers WHERE id = $1`, [Number(id)]);
    if (picked[0]) return picked[0];
  }

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

/** Where a notification takes you: the item it is about. Used by the inbox and by phone alerts. */
export function notificationHref(notification) {
  const sourceTable = String(notification.source_table || '');
  const sourceId = Number(notification.source_id);
  const eventType = String(notification.event_type || '');

  if (sourceTable === 'stock_inbound_shipments' && sourceId > 0) {
    return `/stock?view=purchases&entityType=inbound_shipment&entityId=${sourceId}`;
  }

  if (sourceTable === 'stock_outbound_shipments' && sourceId > 0) {
    return `/stock?view=dispatches&entityType=outbound_shipment&entityId=${sourceId}`;
  }

  if (sourceTable === 'stock_sales_invoices') {
    return sourceId > 0 ? `/stock/invoices/${sourceId}` : '/stock/invoices';
  }

  if (sourceTable === 'stock_leave_requests') {
    return '/stock/attendance?view=leave';
  }

  if (sourceTable === 'stock_change_requests' && sourceId > 0) {
    return `/stock/admin?focus=change-requests&requestId=${sourceId}`;
  }

  if (eventType.startsWith('inbound_')) {
    return '/stock?view=purchases';
  }

  if (eventType.startsWith('outbound_')) {
    return '/stock?view=dispatches';
  }

  return '/stock';
}

const PUSH_TITLES = {
  stock_outbound_shipments: 'Dispatch',
  stock_sales_invoices: 'Estimate',
  stock_inbound_shipments: 'Purchase',
  stock_leave_requests: 'Leave',
  stock_change_requests: 'Change request',
};

/**
 * Phone and desktop alerts for freshly written notifications. Subscriptions and
 * unread counts are read here, inside the request's tenant transaction (RLS
 * shows nothing outside it); the sending waits until the response is out, so
 * an alert never arrives before the change it reports is committed.
 */
async function queuePush(rows) {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
  const userIds = rows.map((row) => Number(row.recipient_user_id));
  const [subscriptions, counts] = await Promise.all([
    sql(
      `SELECT id, user_id, endpoint, p256dh, auth, current_setting('app.tenant_id', true) AS tenant_id
         FROM stock_push_subscriptions WHERE user_id = ANY($1::bigint[])`,
      [userIds]
    ),
    sql(
      `SELECT recipient_user_id, COUNT(*)::int AS unread FROM stock_notifications
        WHERE recipient_user_id = ANY($1::bigint[]) AND is_read = FALSE GROUP BY 1`,
      [userIds]
    ),
  ]);
  if (!subscriptions.length) return;

  const unreadBy = new Map(counts.map((row) => [Number(row.recipient_user_id), row.unread]));
  const rowBy = new Map(rows.map((row) => [Number(row.recipient_user_id), row]));
  const messages = subscriptions.map((subscription) => {
    const row = rowBy.get(Number(subscription.user_id));
    return {
      subscription,
      payload: JSON.stringify({
        title: PUSH_TITLES[row.source_table] || 'Update',
        body: row.message_text,
        tag: row.source_id ? `${row.source_table}:${row.source_id}` : undefined,
        url: notificationHref(row),
        unread: unreadBy.get(Number(subscription.user_id)) || 0,
      }),
    };
  });

  const send = () => sendPush(messages);
  try {
    after(send);
  } catch {
    await send(); // outside a request (scripts): send now
  }
}

async function sendPush(messages) {
  try {
    await sendPushNow(messages);
  } catch (error) {
    console.error('[push] failed:', error.message);
  }
}

async function sendPushNow(messages) {
  const { default: webpush } = await import('web-push');
  // Push services want an https: or mailto: contact; localhost's http: is refused.
  const subject = [process.env.VAPID_SUBJECT, process.env.APP_BASE_URL, process.env.BETTER_AUTH_URL]
    .find((value) => /^(https:|mailto:)/.test(String(value || ''))) || 'mailto:alerts@example.com';
  webpush.setVapidDetails(subject, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const results = await Promise.allSettled(messages.map(({ subscription, payload }) => webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    payload,
    { TTL: 60 * 60 * 24, urgency: 'high' }
  )));

  // 404 / 410: the device unsubscribed or the app was uninstalled. Forget it.
  const gone = messages.filter((_, i) => [404, 410].includes(results[i].reason?.statusCode)).map(({ subscription }) => subscription);
  for (const [tenantId, ids] of Map.groupBy(gone, (s) => s.tenant_id)) {
    await withTenant(tenantId, async () => {
      await sql(`DELETE FROM stock_push_subscriptions WHERE id = ANY($1::bigint[])`, [ids.map((s) => s.id)]);
      return new Response(null, { status: 204 });
    }).catch((error) => console.error('[push] cleanup failed:', error.message));
  }
  results.forEach((result) => {
    if (result.status === 'rejected' && ![404, 410].includes(result.reason?.statusCode)) {
      console.error('[push] send failed:', result.reason?.statusCode, result.reason?.body || result.reason?.message);
    }
  });
}

/**
 * Put one entry in each recipient's own inbox. The actor is never told about
 * their own action. If a recipient still has an unread entry for the same item
 * (same source_table + source_id), that entry is updated and moved to the top
 * instead of a second one stacking up: one entry per dispatch, estimate, etc.
 * Runs in its own savepoint and never throws: a lost notice must not undo or
 * fail the approval that caused it.
 */
export async function notifyUsers({
  userIds = [],
  actorId = null,
  eventType = 'other',
  messageText,
  sourceTable = null,
  sourceId = null,
  createdBy = null,
}) {
  const ids = [...new Set(userIds.map(Number))].filter((id) => id > 0 && id !== Number(actorId));
  if (!ids.length) return [];

  const rows = await withTransaction(() => sql(
    `INSERT INTO stock_notifications (
       notification_number, channel, event_type, recipients, message_text, status,
       source_table, source_id, created_by, recipient_user_id
     )
     SELECT $1 || '-' || u.id, 'internal', $2, '[]'::jsonb, $3, 'sent', $4, $5, $6, u.id
       FROM stock_app_users u
      WHERE u.id = ANY($7::bigint[]) AND u.status = 'active'
     ON CONFLICT (tenant_id, recipient_user_id, source_table, source_id)
       WHERE is_read = FALSE AND recipient_user_id IS NOT NULL AND source_id IS NOT NULL
     DO UPDATE SET event_type = EXCLUDED.event_type,
                   message_text = EXCLUDED.message_text,
                   created_by = EXCLUDED.created_by,
                   created_at = NOW(),
                   updated_at = NOW()
     RETURNING *`,
    [generateReference('NTF'), eventType, messageText, sourceTable, sourceId, createdBy, ids]
  )).catch((error) => {
    console.error('[notifications] notifyUsers failed:', error.message);
    return [];
  });
  if (rows.length) await withTransaction(() => queuePush(rows)).catch((error) => console.error('[push] queue failed:', error.message));
  return rows;
}

/**
 * The item's task is done (approved, rejected, withdrawn): clear the open
 * entries about it, so the other approvers' "needs approval" badges go too.
 * Run before notifyUsers for the outcome, so the outcome entry stays unread.
 */
export async function resolveSourceNotifications(sourceTable, sourceId) {
  await withTransaction(() => sql(
    `UPDATE stock_notifications
        SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
      WHERE source_table = $1 AND source_id = $2 AND is_read = FALSE`,
    [sourceTable, sourceId]
  )).catch((error) => console.error('[notifications] resolve failed:', error.message));
}

/** Active admins and managers: the people who approve. They see every division. */
export async function approverUserIds() {
  const rows = await sql(`SELECT id, role FROM stock_app_users WHERE status = 'active'`, []);
  return rows.filter((row) => getRoleFlags(row.role).canApprove).map((row) => Number(row.id));
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
