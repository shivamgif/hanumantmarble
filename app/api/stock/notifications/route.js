import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole, notificationHref, stockRoute } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

const STOCK_NOTIFICATION_ROLES = ['admin', 'manager', 'stock_maintainer', 'salesperson', 'read_only_admin'];

export const GET = stockRoute(async function GET(request) {
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
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || 25), 100);

    const [notifications, unreadRows] = await Promise.all([
      sql(
        `SELECT id, event_type, message_text, source_table, source_id, created_at, is_read
         FROM stock_notifications
         WHERE recipient_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [appUser.id, limit]
      ),
      sql(
        `SELECT COUNT(*)::INTEGER AS unread_count
         FROM stock_notifications
         WHERE recipient_user_id = $1 AND is_read = FALSE`,
        [appUser.id]
      ),
    ]);

    const enrichedNotifications = notifications.map((notification) => ({
      ...notification,
      actionHref: notificationHref(notification),
    }));

    return NextResponse.json({
      notifications: enrichedNotifications,
      unreadCount: unreadRows[0]?.unread_count || 0,
    });
  } catch (error) {
    console.error('Failed to load stock notifications:', error);
    return NextResponse.json({ error: 'Failed to load notifications', detail: error.message }, { status: 500 });
  }
});

export const PATCH = stockRoute(async function PATCH(request) {
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
    const body = await request.json();
    const action = body?.action;

    if (action === 'markAllRead') {
      await sql(
        `UPDATE stock_notifications
         SET is_read = TRUE,
             read_at = COALESCE(read_at, NOW()),
             updated_at = NOW()
         WHERE recipient_user_id = $1 AND is_read = FALSE`,
        [appUser.id]
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
         WHERE id = $1 AND recipient_user_id = $2`,
        [notificationId, appUser.id]
      );

      return NextResponse.json({ ok: true });
    }

    if (action === 'subscribePush') {
      const { endpoint, keys } = body?.subscription || {};
      if (!/^https:\/\//.test(String(endpoint || '')) || !keys?.p256dh || !keys?.auth) {
        return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
      }
      // Same device signing in as someone else: the alerts follow the new person.
      await sql(
        `INSERT INTO stock_push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, endpoint)
         DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
        [appUser.id, String(endpoint).slice(0, 2000), String(keys.p256dh).slice(0, 200), String(keys.auth).slice(0, 200)]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'unsubscribePush') {
      await sql(
        `DELETE FROM stock_push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
        [String(body?.endpoint || ''), appUser.id]
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to update stock notifications:', error);
    return NextResponse.json({ error: 'Failed to update notifications', detail: error.message }, { status: 500 });
  }
});
