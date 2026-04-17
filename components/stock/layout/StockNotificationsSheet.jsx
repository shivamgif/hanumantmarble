'use client';

import Link from 'next/link';
import { CheckCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export default function StockNotificationsSheet({
  tc,
  accessRole,
  notificationOpen,
  setNotificationOpen,
  unreadCount,
  notifications,
  notificationLoading,
  notificationError,
  notificationUpdating,
  showNotificationDebug,
  setShowNotificationDebug,
  markAllNotificationsRead,
  handleNotificationNavigate,
}) {
  return (
    <Sheet open={notificationOpen} onOpenChange={setNotificationOpen}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[420px]">
        <SheetHeader>
          <SheetTitle>{tc.notifications}</SheetTitle>
          <SheetDescription>{tc.notificationsSubtitle}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {unreadCount} {tc.unread}
          </div>
          <div className="flex items-center gap-2">
            {accessRole === 'admin' ? (
              <button
                type="button"
                onClick={() => setShowNotificationDebug((current) => !current)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                {showNotificationDebug ? tc.hideDebug : tc.debug}
              </button>
            ) : null}
            <button
              type="button"
              onClick={markAllNotificationsRead}
              disabled={notificationUpdating || unreadCount === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {tc.markAllRead}
            </button>
          </div>
        </div>

        {notificationError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {notificationError}
          </div>
        ) : null}

        {notificationLoading ? (
          <div className="mt-4 text-sm text-muted-foreground">{tc.loadingNotifications}</div>
        ) : notifications.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            {tc.noNotifications}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {notifications.map((notification) => {
              const recipients = Array.isArray(notification.recipients)
                ? notification.recipients
                : (() => {
                    try {
                      const parsed = JSON.parse(notification.recipients || '[]');
                      return Array.isArray(parsed) ? parsed : [];
                    } catch {
                      return [];
                    }
                  })();

              const departments = [...new Set(
                recipients
                  .map((recipient) => String(recipient?.department || '').trim())
                  .filter(Boolean)
              )];

              const departmentLabel = departments.length === 0
                ? null
                : departments.length === 1
                  ? departments[0]
                  : `${departments.length} ${tc.departmentsCount}`;

              const firstWhatsappPayload = recipients.find((recipient) => recipient?.whatsappPayload)?.whatsappPayload || null;

              return (
                <Link
                  key={notification.id}
                  href={notification.actionHref || '/stock'}
                  onClick={() => handleNotificationNavigate(notification)}
                  className={`block w-full rounded-xl border px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/5 ${
                    notification.is_read ? 'border-border bg-card' : 'border-primary/25 bg-primary/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{notification.event_type.replace(/_/g, ' ')}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {notification.channel}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground/85">{notification.message_text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {departmentLabel ? (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-semibold">
                        {tc.target}: {departmentLabel}
                      </span>
                    ) : null}
                    {departments.length > 0 ? (
                      <span>{recipients.length} {tc.recipients} • {departments.length} {tc.departmentsShort}</span>
                    ) : null}
                  </div>
                  {showNotificationDebug && accessRole === 'admin' && firstWhatsappPayload ? (
                    <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-2 text-[10px] text-foreground/80">
                      {JSON.stringify(firstWhatsappPayload, null, 2)}
                    </pre>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</p>
                    <span className="text-[11px] font-semibold text-primary">{tc.open}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
