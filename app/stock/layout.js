'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, FileText, Home, Languages, MoonStar, PackagePlus, Search, SunMedium, Users, LogOut } from 'lucide-react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import BrandedLoginPage from '@/components/BrandedLoginPage';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

function SidebarNavItem({ Icon, Label, Href, IsActive }) {
  return (
    <Link
      href={Href}
      title={Label}
      aria-label={Label}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
        IsActive
          ? 'bg-[#E07A00]/10 text-[#E07A00] border-r-4 border-[#E07A00] shadow-[inset_-4px_0_12px_rgba(224,122,0,0.1)]'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{Label}</span>
    </Link>
  );
}

const CLASSES = {
  shell: 'relative min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100',
  sidebar: 'fixed inset-y-0 left-0 z-30 hidden h-screen w-64 overflow-y-auto border-r border-slate-200 bg-white lg:block dark:border-white/10 dark:bg-slate-950',
  topbar: 'sticky top-0 z-20 border-b border-slate-200/20 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80 sm:px-6 lg:px-8',
  actionIconButton: 'h-9 w-9 rounded-xl hover:bg-slate-100 transition-all active:scale-95 dark:hover:bg-slate-800',
};

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
              <div className="relative h-12 w-12 overflow-hidden ">
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
    <div className={CLASSES.shell}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#E07A00]/10 blur-3xl" />
        <div className="absolute -right-24 bottom-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <aside className={CLASSES.sidebar}>
        <div className="flex items-center gap-3 ">
          <div className="relative h-16 w-16 overflow-hidden ">
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
            <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500 dark:text-slate-400">HANUMANT</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{t('brand')}</p>
          </div>
        </div>

        <div className="space-y-4 px-3 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-[#E07A00]/10 hover:text-[#E07A00] dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              aria-label={language === 'en' ? t('switchToHindi') : t('switchToEnglish')}
            >
              <Languages className="h-4 w-4" />
              <span>{language.toUpperCase()}</span>
            </button>
            <button
              type="button"
              onClick={() => setNotificationOpen(true)}
              className="relative inline-flex rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-[#E07A00]/10 hover:text-[#E07A00] dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
          </div>

          <nav className="space-y-1">
            {navigationItems.map((item) => (
              <SidebarNavItem
                key={item.href}
                Icon={item.icon}
                Label={item.label}
                Href={item.href}
                IsActive={isActiveRoute(item.href)}
              />
            ))}
          </nav>
        </div>

        <div className="mt-auto space-y-3 border-t border-slate-200 px-3 py-4 dark:border-white/10">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{t('signedInAs')}</p>
            <p className="mt-1 break-words text-xs text-slate-700 dark:text-slate-200">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-slate-700 transition hover:bg-[#E07A00]/10 hover:text-[#E07A00] dark:text-slate-300"
              title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              <span className="text-xs">{isDarkTheme ? 'Light' : 'Dark'}</span>
            </button>
            <button
              type="button"
              onClick={handleStockLogout}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-slate-700 transition hover:bg-[#E07A00]/10 hover:text-[#E07A00] dark:text-slate-300"
              title={t('logout')}
              aria-label={t('logout')}
            >
              <LogOut className="h-4 w-4" />
              <span className="text-xs">{t('logout')}</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200/20 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-2">
            <div className="hidden items-center justify-between gap-4 md:flex">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">ERP Workspace</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">Stock operations and approvals</p>
              </div>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Hub (CMD+K)"
                  className="w-80 rounded-xl border-none bg-slate-100 px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:bg-slate-900 dark:text-slate-200"
                  readOnly
                />
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400">CMD+K</span>
              </div>
            </div>

            <div className="space-y-2 md:hidden">
              <div className="flex items-center justify-between gap-3">
                <Link href="/stock" className="inline-flex min-w-0 items-center gap-2" aria-label="Hanumant Marble stock dashboard">
                  <div className="relative h-10 w-10 overflow-hidden">
                    <Image src="/logo.png" alt="Hanumant Marble logo" fill sizes="32px" className="object-contain p-1" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">HANUMANT</p>
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{t('brand')}</p>
                  </div>
                </Link>

                <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all active:scale-95 hover:bg-[#E07A00]/10 hover:text-[#E07A00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label={language === 'en' ? t('switchToHindi') : t('switchToEnglish')}
                  title={language.toUpperCase()}
                >
                  <Languages className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationOpen(true)}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all active:scale-95 hover:bg-[#E07A00]/10 hover:text-[#E07A00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Open notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all active:scale-95 hover:bg-[#E07A00]/10 hover:text-[#E07A00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
                >
                  {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleStockLogout}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all active:scale-95 hover:bg-[#E07A00]/10 hover:text-[#E07A00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label={t('logout')}
                >
                  <LogOut className="h-4 w-4" />
                </button>
                </div>
              </div>

              <nav className="flex items-center justify-center gap-2" aria-label="Mobile stock navigation">
                {navigationItems.map((item) => {
                  const active = isActiveRoute(item.href);
                  const mobileLabel = item.href === '/stock/admin' ? 'Admin Hub' : 'Dashboard';
                  return (
                    <Link
                      key={`mobile-top-${item.href}`}
                      href={item.href}
                      aria-label={mobileLabel}
                      title={mobileLabel}
                      className={`inline-flex h-9 items-center justify-between gap-5 rounded-xl border px-12 text-xs font-semibold transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 ${active ? 'border-[#E07A00]/30 bg-[#E07A00]/10 text-[#E07A00]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      <span>{mobileLabel}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
        <footer className="border-t border-slate-200 bg-slate-50/90 px-4 py-4 text-center text-sm text-slate-600 sm:px-6 lg:px-8 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400">
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
