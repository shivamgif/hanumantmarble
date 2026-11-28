'use client';

import Link from 'next/link';
import { BellRing, CheckCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const KIND_BY_SOURCE = {
  stock_outbound_shipments: 'kindDispatch',
  stock_sales_invoices: 'kindEstimate',
  stock_inbound_shipments: 'kindPurchase',
  stock_leave_requests: 'kindLeave',
  stock_change_requests: 'kindChange',
};

function relativeTime(value, language) {
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(language === 'hi' ? 'hi' : 'en', { numeric: 'auto' });
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}

export default function StockNotificationsSheet({
  t,
  language,
  notificationOpen,
  setNotificationOpen,
  unreadCount,
  notifications,
  notificationLoading,
  notificationError,
  notificationUpdating,
  markAllNotificationsRead,
  handleNotificationNavigate,
  pushPermission,
  enablePush,
}) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups = [
    [t('today'), notifications.filter((n) => new Date(n.created_at).getTime() >= startOfToday)],
    [t('earlier'), notifications.filter((n) => new Date(n.created_at).getTime() < startOfToday)],
  ].filter(([, rows]) => rows.length);

  return (
    <Sheet open={notificationOpen} onOpenChange={setNotificationOpen}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[460px] p-0 border-l">
        <div className="p-6 space-y-6">
          <SheetHeader className="text-left space-y-1">
            <SheetTitle className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{t('notifications')}</SheetTitle>
            <SheetDescription className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('notificationsSubtitle')}
            </SheetDescription>
          </SheetHeader>

          {pushPermission === 'default' ? (
            <button
              type="button"
              onClick={enablePush}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-muted"
            >
              <BellRing className="h-4 w-4" />
              {t('phoneAlertsOn')}
            </button>
          ) : pushPermission === 'denied' ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('phoneAlertsBlocked')}</p>
          ) : null}

          <div className="flex items-center justify-between gap-4 border-y border-border py-4">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{unreadCount}</span> {t('unread')}
            </div>
            <button
              type="button"
              onClick={markAllNotificationsRead}
              disabled={notificationUpdating || unreadCount === 0}
              className="h-8 px-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-muted disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('markAllRead')}
            </button>
          </div>

          {notificationError ? (
            <div className="rounded-lg border border-border bg-muted px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
              {notificationError}
            </div>
          ) : null}

          {notificationLoading ? (
            <div className="text-xs font-medium text-slate-400 text-center py-20">{t('loadingNotifications')}</div>
          ) : notifications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('noNotifications')}</p>
            </div>
          ) : (
            groups.map(([label, rows]) => (
              <section key={label} className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</h3>
                <div className="-mx-2 divide-y divide-border">
                  {rows.map((notification) => (
                    <Link
                      key={notification.id}
                      href={notification.actionHref || '/stock'}
                      onClick={() => handleNotificationNavigate(notification)}
                      className="relative block w-full rounded-lg px-2 py-3 pl-6 text-left transition-colors hover:bg-muted/60 focus-ring"
                    >
                      {!notification.is_read && <span aria-hidden="true" className="absolute left-2 top-[1.15rem] h-2 w-2 rounded-full bg-foreground" />}
                      <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium">{t(KIND_BY_SOURCE[notification.source_table] || 'kindUpdate')}</span>
                        <time dateTime={notification.created_at} title={new Date(notification.created_at).toLocaleString()} className="shrink-0 tabular-nums">
                          {relativeTime(notification.created_at, language)}
                        </time>
                      </div>
                      <p className={`mt-0.5 text-sm leading-relaxed ${notification.is_read ? 'text-slate-600 dark:text-slate-400' : 'font-medium text-slate-900 dark:text-white'}`}>
                        {notification.message_text}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
