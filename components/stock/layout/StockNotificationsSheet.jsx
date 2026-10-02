'use client';

import Link from 'next/link';
import { CheckCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export default function StockNotificationsSheet({
  t,
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
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[460px] p-0 border-l">
        <div className="p-6 space-y-5">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center gap-3">
              <SheetTitle className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{t('notifications')}</SheetTitle>
            </div>
            <SheetDescription className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('notificationsSubtitle')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center justify-between gap-4 border-y border-border py-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{unreadCount}</span> {t('unread')}
            </div>
            <div className="flex items-center gap-2">
              {accessRole === 'admin' ? (
                <button
                  type="button"
                  onClick={() => setShowNotificationDebug((current) => !current)}
                  className="h-8 px-3 rounded-md border border-border bg-card text-xs font-medium text-slate-600 dark:text-slate-400 transition-colors hover:bg-muted"
                >
                  {showNotificationDebug ? t('hideDebug') : t('debug')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={markAllNotificationsRead}
                disabled={notificationUpdating || unreadCount === 0}
                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-muted disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('markAllRead')}
              </button>
            </div>
          </div>

          {notificationError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {notificationError}
            </div>
          ) : null}

          {notificationLoading ? (
            <div className="text-xs font-medium text-slate-400 text-center py-20">{t('loadingNotifications')}</div>
          ) : notifications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('noNotifications')}</p>
            </div>
          ) : (
            <div className="-mx-2 divide-y divide-border">
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
                    : `${departments.length} ${t('departmentsCount')}`;

                const firstWhatsappPayload = recipients.find((recipient) => recipient?.whatsappPayload)?.whatsappPayload || null;

                return (
                  <Link
                    key={notification.id}
                    href={notification.actionHref || '/stock'}
                    onClick={() => handleNotificationNavigate(notification)}
                    className="relative block w-full rounded-md px-2 py-3.5 pl-6 text-left transition-colors hover:bg-muted/60 focus-ring"
                  >
                    {!notification.is_read && <span aria-hidden="true" className="absolute left-2 top-5 h-2 w-2 rounded-full bg-brand-primary" />}
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <p className={`text-sm capitalize ${notification.is_read ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-white'}`}>{notification.event_type.replace(/_/g, ' ')}</p>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">
                        {new Date(notification.created_at).toLocaleDateString()} · {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{notification.message_text}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{notification.channel}</span>
                      {departmentLabel ? <><span aria-hidden="true">·</span><span>{t('target')}: {departmentLabel}</span></> : null}
                      <span className="ml-auto font-medium text-brand-primary">{t('open')} →</span>
                    </div>

                    {showNotificationDebug && accessRole === 'admin' && firstWhatsappPayload ? (
                      <pre className="mt-3 overflow-auto rounded-md border border-border bg-muted p-3 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        {JSON.stringify(firstWhatsappPayload, null, 2)}
                      </pre>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
