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
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[480px] p-0 glass-panel border-l border-white/5 shadow-2xl">
        <div className="p-8 space-y-8">
          <SheetHeader className="text-left space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-6 w-1 rounded-full bg-brand-primary" />
              <SheetTitle className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{tc.notifications}</SheetTitle>
            </div>
            <SheetDescription className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-relaxed">
              {tc.notificationsSubtitle}
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/40 dark:bg-slate-950/40 border border-slate-100 dark:border-white/5">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary">
              {unreadCount} {tc.unread} Records
            </div>
            <div className="flex items-center gap-2">
              {accessRole === 'admin' ? (
                <button
                  type="button"
                  onClick={() => setShowNotificationDebug((current) => !current)}
                  className="h-9 px-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 transition-all hover:border-brand-primary/30"
                >
                  {showNotificationDebug ? tc.hideDebug : tc.debug}
                </button>
              ) : null}
              <button
                type="button"
                onClick={markAllNotificationsRead}
                disabled={notificationUpdating || unreadCount === 0}
                className="h-9 px-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-brand-primary text-white text-[9px] font-black uppercase tracking-widest transition-all hover:brightness-110 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {tc.markAllRead}
              </button>
            </div>
          </div>

          {notificationError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-[11px] font-bold text-rose-700 animate-in fade-in duration-500">
              {notificationError}
            </div>
          ) : null}

          {notificationLoading ? (
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center py-20">{tc.loadingNotifications}</div>
          ) : notifications.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 px-6 py-16 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">{tc.noNotifications}</p>
            </div>
          ) : (
            <div className="space-y-4">
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
                    className={`block w-full rounded-2xl border p-5 text-left transition-all duration-300 hover:scale-[1.01] ${
                      notification.is_read 
                        ? 'border-slate-100 bg-white/40 dark:border-white/5 dark:bg-slate-900/40' 
                        : 'border-brand-primary/20 bg-brand-primary/5 ring-1 ring-brand-primary/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">{notification.event_type.replace(/_/g, ' ')}</p>
                      <span className="rounded-full bg-slate-900 dark:bg-slate-800 px-3 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white">
                        {notification.channel}
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 font-medium">{notification.message_text}</p>
                    
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <span>{new Date(notification.created_at).toLocaleDateString()}</span>
                        <span className="opacity-30">•</span>
                        <span>{new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-brand-primary underline decoration-2 underline-offset-4">{tc.open} Protocol</span>
                    </div>

                    {departmentLabel ? (
                      <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <span className="text-brand-primary">{tc.target}:</span> {departmentLabel}
                      </div>
                    ) : null}

                    {showNotificationDebug && accessRole === 'admin' && firstWhatsappPayload ? (
                      <pre className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
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
