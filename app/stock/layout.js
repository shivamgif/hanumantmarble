'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, FileText, Home, Languages, MoonStar, PackagePlus, SunMedium, Users, LogOut } from 'lucide-react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import BrandedLoginPage from '@/components/BrandedLoginPage';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * Layout for internal stock management routes
 * Enforces authentication and internal-only access
 */
export default function StockLayout({ children }) {
  const { user, isLoading, error } = useUser();
  const { language, toggleLanguage } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessApproved, setAccessApproved] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessRole, setAccessRole] = useState('stock_maintainer');
  const [collapsed, setCollapsed] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState(null);
  const [notificationUpdating, setNotificationUpdating] = useState(false);
  const [showNotificationDebug, setShowNotificationDebug] = useState(false);

  const t = (key) => getTranslation(`stock.layout.${key}`, language);
  const isDarkTheme = resolvedTheme === 'dark';
  const isUnauthorizedError = error?.message === 'Unauthorized' || error?.status === 401;
  function handleStockLogout() {
    document.cookie = `hm-login-return-to=${encodeURIComponent('/stock')}; Path=/; Max-Age=300; SameSite=Lax`;
    window.location.href = `/auth/logout?returnTo=${encodeURIComponent(window.location.origin)}`;
  }

  const navigationItems = [
    { href: '/stock', label: t('dashboard'), icon: Home },
  ];

  if (accessRole === 'admin' || accessRole === 'manager') {
    navigationItems.push({ href: '/stock/admin', label: t('adminDashboard'), icon: Users });
  }

  const isActiveRoute = (href) => {
    const cleanHref = href.split('#')[0];

    if (cleanHref === '/stock') {
      return pathname === '/stock';
    }

    return pathname?.startsWith(cleanHref);
  };

  useEffect(() => {
    const storedCollapsed = window.localStorage.getItem('stock-sidebar-collapsed');
    if (storedCollapsed !== null) {
      setCollapsed(storedCollapsed === 'true');
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('stock-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      if (!user) {
        return;
      }

      setAccessLoading(true);
      try {
        const response = await fetch('/api/stock/access', { cache: 'no-store' });
        const result = await response.json();

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setAccessApproved(false);
          setAccessMessage(result.error || t('accessFallback'));
          return;
        }

        setAccessApproved(Boolean(result.approved));
        setAccessMessage(result.message || t('accessPendingFallback'));
        setAccessRole(result.role || 'stock_maintainer');
      } catch (accessError) {
        if (!mounted) {
          return;
        }

        setAccessApproved(false);
        setAccessMessage(accessError.message || t('accessFallback'));
      } finally {
        if (mounted) {
          setAccessLoading(false);
        }
      }
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [user]);

  async function loadNotifications({ silent = false } = {}) {
    if (!silent) {
      setNotificationLoading(true);
    }

    try {
      const response = await fetch('/api/stock/notifications?limit=25', { cache: 'no-store' });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to load notifications');
      }

      setNotifications(json.notifications || []);
      setUnreadCount(Number(json.unreadCount || 0));
      setNotificationError(null);
    } catch (err) {
      setNotificationError(err.message);
    } finally {
      if (!silent) {
        setNotificationLoading(false);
      }
    }
  }

  async function markAllNotificationsRead() {
    setNotificationUpdating(true);

    try {
      const response = await fetch('/api/stock/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markAllRead' }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to mark notifications read');
      }

      await loadNotifications({ silent: true });
    } catch (err) {
      setNotificationError(err.message);
    } finally {
      setNotificationUpdating(false);
    }
  }

  async function markNotificationRead(notificationId) {
    try {
      const response = await fetch('/api/stock/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markRead', id: notificationId }),
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || 'Failed to mark notification read');
      }

      await loadNotifications({ silent: true });
    } catch (err) {
      setNotificationError(err.message);
    }
  }

  function handleNotificationNavigate(notification) {
    if (!notification?.is_read) {
      markNotificationRead(notification.id);
    }
    setNotificationOpen(false);
  }

  useEffect(() => {
    if (!accessApproved || !user) {
      return;
    }

    loadNotifications();

    const intervalId = setInterval(() => {
      loadNotifications({ silent: true });
    }, 30000);

    return () => clearInterval(intervalId);
  }, [accessApproved, user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error && !isUnauthorizedError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">{t('accessError')}</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <BrandedLoginPage returnTo="/stock" />;
  }

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto"></div>
          <p className="text-gray-600 mt-4">{t('loadingAccess')}</p>
        </div>
      </div>
    );
  }

  if (!accessApproved) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10 text-foreground">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
        </div>
        <div className="relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-border bg-muted/40">
                <Image
                  src="/logo.png"
                  alt="Hanumant Marble logo"
                  fill
                  sizes="48px"
                  className="object-contain p-1.5"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hanumant Marble</p>
                <p className="text-sm text-muted-foreground">Stock management access</p>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t('waitingApproval')}</h1>
            <p className="mt-3 text-muted-foreground">{accessMessage}</p>
            <p className="mt-3 text-sm text-muted-foreground">{t('waitingDetails')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={handleStockLogout} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted/60">{t('logout')}</button>
              <Link href="/" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">{t('goWebsite')}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground lg:flex">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-24 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
      </div>
      <aside className={`relative z-10 border-b border-border bg-card/95 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r lg:border-border ${collapsed ? 'lg:w-[92px]' : 'lg:w-[280px]'}`}>
        <div className={`flex items-center gap-2 px-3 py-2 lg:gap-3 lg:py-3 lg:border-b lg:border-border ${collapsed ? 'lg:justify-center' : ''}`}>
          <Link href="/stock" className={`flex items-center gap-3 ${collapsed ? 'lg:justify-center' : ''}`} aria-label="Hanumant Marble stock dashboard">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-border bg-muted/40 lg:h-16 lg:w-16 lg:rounded-2xl">
              <Image
                src="/logo.png"
                alt="Hanumant Marble logo"
                fill
                sizes="(max-width: 1024px) 40px, 64px"
                className="object-contain p-1.5"
                priority
              />
            </div>
            <div className={collapsed ? 'lg:hidden' : ''}>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground lg:text-sm lg:tracking-[0.2em]">HANUMANT</p>
              <p className="text-sm font-bold leading-tight text-foreground lg:text-lg">{t('brand')}</p>
            </div>
          </Link>

          
        </div>

        <div className={`px-3 pb-3 lg:px-5 lg:pb-5 lg:flex lg:flex-1 lg:flex-col lg:justify-between ${collapsed ? 'lg:px-3' : ''}`}>
          <div className="space-y-8">
            <div className={`mt-2 flex items-center gap-1 lg:mt-4 ${collapsed ? 'lg:justify-center' : 'justify-between'} lg:flex-nowrap`}>
            <button
              type="button"
              onClick={toggleLanguage}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-muted/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition hover:bg-primary/10 hover:text-primary lg:px-3 lg:py-2 lg:text-xs lg:tracking-[0.15em] ${collapsed ? 'lg:px-2' : ''}`}
              aria-label={language === 'en' ? t('switchToHindi') : t('switchToEnglish')}
            >
              <Languages className="h-4 w-4" />
              <span className={collapsed ? 'lg:hidden' : 'inline'}>{language.toUpperCase()}</span>
            </button>
            <button
              type="button"
              onClick={() => setNotificationOpen(true)}
              className="relative inline-flex shrink-0 rounded-full border border-border bg-muted/60 p-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
               <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="hidden shrink-0 lg:inline-flex rounded-full border border-border bg-muted/60 p-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              aria-label={collapsed ? t('openSidebar') : t('closeSidebar')}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            </div>
            <div className={`hidden rounded-3xl border border-border bg-muted/40 p-4 lg:block ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('workspace')}</p>
              <h1 className="mt-2 text-xl font-bold text-foreground">{t('internalDashboard')}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('workspaceHelp')}</p>
            </div>

            <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = isActiveRoute(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition lg:gap-3 lg:rounded-2xl lg:px-4 lg:py-3 lg:text-sm ${collapsed ? 'lg:justify-center lg:px-3' : ''} ${active ? 'bg-primary/10 text-primary shadow-sm' : 'text-foreground/75 hover:bg-primary/10 hover:text-primary'}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-foreground/60'}`} />
                    <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm lg:mt-8 lg:space-y-4 lg:pt-5">
            <div className={`hidden rounded-2xl border border-border bg-muted/40 px-4 py-3 lg:block ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('signedInAs')}</p>
              <p className="mt-2 break-words text-sm text-foreground">{user?.email}</p>
            </div>
            <div className={`flex items-center gap-2 ${collapsed ? 'lg:justify-center' : ''}`}>
              <button
                type="button"
                onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-foreground/75 transition hover:bg-primary/10 hover:text-primary lg:gap-3 lg:rounded-2xl lg:px-4 lg:py-3 ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}
                title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
                aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                <span className={`hidden lg:inline ${collapsed ? 'lg:hidden' : ''}`}>{isDarkTheme ? 'Light' : 'Dark'}</span>
              </button>
              <button type="button" onClick={handleStockLogout} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-foreground/75 transition hover:bg-primary/10 hover:text-primary lg:gap-3 lg:rounded-2xl lg:px-4 lg:py-3 ${collapsed ? 'lg:justify-center lg:px-3' : ''}`} title={t('logout')} aria-label={t('logout')}>
                <LogOut className="h-4 w-4" />
                <span className={`hidden lg:inline ${collapsed ? 'lg:hidden' : ''}`}>{t('logout')}</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="border-t border-border bg-card px-4 py-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>{t('footerTitle')} • {t('footerUpdated')}: {new Date().toLocaleString()}</p>
        </footer>
      </div>

      <Sheet open={notificationOpen} onOpenChange={setNotificationOpen}>
        <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[420px]">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>Operational alerts and shipment updates from stock workflow.</SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {unreadCount} unread
            </div>
            <div className="flex items-center gap-2">
              {accessRole === 'admin' ? (
                <button
                  type="button"
                  onClick={() => setShowNotificationDebug((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                >
                  {showNotificationDebug ? 'Hide Debug' : 'Debug'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={markAllNotificationsRead}
                disabled={notificationUpdating || unreadCount === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            </div>
          </div>

          {notificationError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {notificationError}
            </div>
          ) : null}

          {notificationLoading ? (
            <div className="mt-4 text-sm text-muted-foreground">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {notifications.map((notification) => (
                (() => {
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
                      : `${departments.length} departments`;

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
                            Target: {departmentLabel}
                          </span>
                        ) : null}
                        {departments.length > 0 ? (
                          <span>{recipients.length} recipients • {departments.length} dept</span>
                        ) : null}
                      </div>
                      {showNotificationDebug && accessRole === 'admin' && firstWhatsappPayload ? (
                        <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-2 text-[10px] text-foreground/80">
{JSON.stringify(firstWhatsappPayload, null, 2)}
                        </pre>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</p>
                        <span className="text-[11px] font-semibold text-primary">Open</span>
                      </div>
                    </Link>
                  );
                })()
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
