import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

const STOCK_NOTIFICATION_ROLES = ['admin', 'manager', 'stock_maintainer', 'salesperson'];

function buildNotificationActionHref(notification) {
  const sourceTable = String(notification.source_table || '');
  const sourceId = Number(notification.source_id);
  const eventType = String(notification.event_type || '');

  if (sourceTable === 'stock_inbound_shipments' && sourceId > 0) {
    return `/stock?view=purchases&entityType=inbound_shipment&entityId=${sourceId}`;
  }

  if (sourceTable === 'stock_outbound_shipments' && sourceId > 0) {
    return `/stock?view=dispatches&entityType=outbound_shipment&entityId=${sourceId}`;
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


export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, STOCK_NOTIFICATION_ROLES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Removed per-request schema alteration

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || 25), 100);

    const [notifications, unreadRows] = await Promise.all([
      sql(
        `SELECT
           id,
           notification_number,
           channel,
           event_type,
           recipients,
           message_text,
           status,
           source_table,
           source_id,
           created_by,
           created_at,
           is_read,
           read_at
         FROM stock_notifications
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      ),
      sql(
        `SELECT COUNT(*)::INTEGER AS unread_count
         FROM stock_notifications
         WHERE is_read = FALSE`,
        []
      ),
    ]);

    const enrichedNotifications = notifications.map((notification) => ({
      ...notification,
      actionHref: buildNotificationActionHref(notification),
    }));

    return NextResponse.json({
      notifications: enrichedNotifications,
      unreadCount: unreadRows[0]?.unread_count || 0,
    });
  } catch (error) {
    console.error('Failed to load stock notifications:', error);
    return NextResponse.json({ error: 'Failed to load notifications', detail: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, STOCK_NOTIFICATION_ROLES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Removed per-request schema alteration

    const body = await request.json();
    const action = body?.action;

    if (action === 'markAllRead') {
      await sql(
        `UPDATE stock_notifications
         SET is_read = TRUE,
             read_at = COALESCE(read_at, NOW()),
             updated_at = NOW()
         WHERE is_read = FALSE`,
        []
      );

      return NextResponse.json({ ok: true });
    }

    if (action === 'markRead') {
      const notificationId = Number(body?.id);

      if (!notificationId) {
        return NextResponse.json({ error: 'Notification id is required' }, { status: 400 });
      }

      await sql(
        `UPDATE stock_notifications
         SET is_read = TRUE,
             read_at = COALESCE(read_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [notificationId]
      );

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to update stock notifications:', error);
    return NextResponse.json({ error: 'Failed to update notifications', detail: error.message }, { status: 500 });
  }
}
