'use client';

import { BarChart2, BookOpen, Clock, FileText, Home, Settings, Users } from 'lucide-react';
import { getLogoutHref, useAuthUser } from '@/lib/auth-client';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLayoutPref } from '@/hooks/useLayoutPref';
import { ACCENTS, accentOf } from '@/lib/accent.mjs';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import BrandedLoginPage from '@/components/BrandedLoginPage';

import { getRoleFlags } from '@/lib/stock-roles.mjs';
import { useStockAccess } from '@/hooks/useStockAccess';
import { useStockNotifications } from '@/hooks/useStockNotifications';
import { useStockShortcuts } from '@/hooks/useStockShortcuts';

import { TooltipProvider } from '@/components/ui/tooltip';
import StockSidebar from '@/components/stock/layout/StockSidebar';
import StockTopbar, { ShortcutsSheet } from '@/components/stock/layout/StockTopbar';
import StockNotificationsSheet from '@/components/stock/layout/StockNotificationsSheet';
import ClockInReminder from '@/components/stock/layout/ClockInReminder';
import { CompanyMark } from '@/components/ui/brand-mark';
import { PRODUCT_NAME } from '@/lib/product';

const ALWAYS_SHOWN = new Set(['/stock', '/stock/settings']);

function FullScreenSpinner({ label }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-[#0b0f1a]">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand-primary" />
        <p className="text-sm text-slate-400 dark:text-slate-500">{label}</p>
      </div>
    </div>
  );
}

const CLASSES = {
  shell: 'relative min-h-screen bg-slate-50/80 font-sans text-slate-900 dark:bg-[#0b0f1a] dark:text-slate-100',
  sidebar: 'fixed inset-y-0 left-0 z-30 hidden h-screen bg-white lg:flex lg:flex-col dark:bg-slate-900 transition-[width] duration-200 print:!hidden',
};

export default function StockShell({ children }) {
  const { user, isLoading, error } = useAuthUser();
  const { language, toggleLanguage } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();

  const dashboardSearchRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { accessLoading, hasResolvedAccessOnce, accessApproved, accessMessage, accessRole, accessUser, accessTenant, accessTenants } = useStockAccess(user);

  // The company's accent. On <body>, not the shell, so Radix sheets and menus
  // (portalled into <body>) pick it up too. globals.css reads these.
  const accentKey = accessTenant?.accent;
  useEffect(() => {
    const accent = ACCENTS[accentOf(accentKey)];
    const style = document.body.style;
    style.setProperty('--accent-light', accent.light);
    style.setProperty('--accent-dark', accent.dark);
    return () => {
      style.removeProperty('--accent-light');
      style.removeProperty('--accent-dark');
    };
  }, [accentKey]);

  const notificationsState = useStockNotifications({ user, accessApproved });
  const { isApplePlatform, shortcutsOpen, setShortcutsOpen } = useStockShortcuts({ dashboardSearchRef, accessRole });

  const t = (key) => getTranslation(`stock.layout.${key}`, language);
  const tc = {
    brandFull: accessTenant?.name || PRODUCT_NAME,
    stockAccess: language === 'hi' ? 'स्टॉक प्रबंधन पहुंच' : 'Stock management access',
    openNotifications: language === 'hi' ? 'सूचनाएं खोलें' : 'Open notifications',
    switchToLight: language === 'hi' ? 'लाइट थीम में बदलें' : 'Switch to light theme',
    switchToDark: language === 'hi' ? 'डार्क थीम में बदलें' : 'Switch to dark theme',
    light: language === 'hi' ? 'लाइट' : 'Light',
    dark: language === 'hi' ? 'डार्क' : 'Dark',
    dashboardAria: `${accessTenant?.name || PRODUCT_NAME} ${language === 'hi' ? 'स्टॉक डैशबोर्ड' : 'stock dashboard'}`,
    mobileNav: language === 'hi' ? 'मोबाइल स्टॉक नेविगेशन' : 'Mobile stock navigation',
    adminHub: language === 'hi' ? 'एडमिन हब' : 'Admin Hub',
    dashboard: language === 'hi' ? 'डैशबोर्ड' : 'Dashboard',
    analytics: language === 'hi' ? 'विश्लेषण' : 'Analytics',
    notifications: language === 'hi' ? 'सूचनाएं' : 'Notifications',
    notificationsSubtitle: language === 'hi' ? 'स्टॉक वर्कफ़्लो से संचालन अलर्ट और शिपमेंट अपडेट।' : 'Operational alerts and shipment updates from stock workflow.',
    unread: language === 'hi' ? 'अपठित' : 'unread',
    hideDebug: language === 'hi' ? 'डिबग छिपाएं' : 'Hide Debug',
    debug: language === 'hi' ? 'डिबग' : 'Debug',
    markAllRead: language === 'hi' ? 'सभी को पढ़ा हुआ चिन्हित करें' : 'Mark all read',
    loadingNotifications: language === 'hi' ? 'सूचनाएं लोड हो रही हैं...' : 'Loading notifications...',
    noNotifications: language === 'hi' ? 'अभी कोई सूचना नहीं है।' : 'No notifications yet.',
    target: language === 'hi' ? 'लक्ष्य' : 'Target',
    recipients: language === 'hi' ? 'प्राप्तकर्ता' : 'recipients',
    departmentsShort: language === 'hi' ? 'विभाग' : 'dept',
    departmentsCount: language === 'hi' ? 'विभाग' : 'departments',
    open: language === 'hi' ? 'खोलें' : 'Open',
  };

  const isDarkTheme = resolvedTheme === 'dark';
  const primaryModifierLabel = isApplePlatform ? 'CMD + ' : 'Ctrl + ';
  const isUnauthorizedError = error?.message === 'Unauthorized' || error?.status === 401;

  function handleStockLogout() {
    document.cookie = `hm-login-return-to=${encodeURIComponent('/stock')}; Path=/; Max-Age=300; SameSite=Lax`;
    window.location.href = getLogoutHref(window.location.origin);
  }

  const navigationItems = [
    { href: '/stock', label: t('dashboard'), icon: Home },
    // Everyone punches, so this is not role-gated. The page itself hides the
    // team/payroll/settings tabs from those without the attendance flags.
    { href: '/stock/attendance', label: t('attendance'), icon: Clock },
  ];

  // Sellers raise estimates, approvers issue them. Stock staff open single
  // invoices by scanning the QR to dispatch, so no list link for them.
  // read_only_admin can still open /stock/invoices directly.
  if (!['read_only_admin', 'stock_maintainer'].includes(accessRole)) {
    navigationItems.push({ href: '/stock/invoices', label: t('invoices'), icon: FileText });
  }
  // Books: approvers run them, read_only_admin reads. Salespeople never see them.
  if (['admin', 'manager', 'read_only_admin'].includes(accessRole)) {
    navigationItems.push({ href: '/stock/accounts', label: t('accounts'), icon: BookOpen });
  }
  if (accessRole === 'admin' || accessRole === 'manager') {
    navigationItems.push({ href: '/stock/admin', label: t('adminDashboard'), icon: Users });
    navigationItems.push({ href: '/stock/settings', label: language === 'hi' ? 'सेटिंग्स' : 'Settings', icon: Settings });
  }
  if (getRoleFlags(accessRole).canViewAllAnalytics || accessRole === 'salesperson') {
    navigationItems.push({ href: '/stock/analytics', label: t('analytics'), icon: BarChart2 });
  }

  // The person's own sidebar order (Customize sidebar). The role decides which
  // links exist; the saved prefs only sort and hide those, so they can never
  // add a page. Dashboard stays first and Settings cannot be hidden, so nobody
  // locks themselves out of putting it back.
  const navKey = navigationItems.map((item) => item.href).join('|');
  const navDefaults = useMemo(() => navKey.split('|').map((id) => ({ id })), [navKey]);
  const navLayout = useLayoutPref('nav', navDefaults, accessUser?.ui_prefs?.nav);
  const [navEditing, setNavEditing] = useState(false);
  const byHref = Object.fromEntries(navigationItems.map((item) => [item.href, item]));
  const arrangedNav = [
    ...navLayout.items.filter((item) => item.id === '/stock'),
    ...navLayout.items.filter((item) => item.id !== '/stock'),
  ].map((item) => ({ ...byHref[item.id], hidden: item.hidden && !ALWAYS_SHOWN.has(item.id) }));
  const visibleNav = arrangedNav.filter((item) => !item.hidden);
  const saveNav = (list) => navLayout.save(list.map((item) => ({ id: item.href, span: 12, hidden: item.hidden })));

  const isActiveRoute = (href) => {
    const cleanHref = href.split('#')[0];
    if (cleanHref === '/stock') {
      return pathname === '/stock';
    }
    return pathname?.startsWith(cleanHref);
  };

  if (isLoading) {
    return <FullScreenSpinner label="Loading…" />;
  }

  if (error && !isUnauthorizedError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-[#0b0f1a]">
        <div className="text-center max-w-sm px-4">
          <h1 className="text-lg font-semibold text-red-600">{t('accessError')}</h1>
          <p className="text-sm text-slate-500 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <BrandedLoginPage returnTo="/stock" isInline />;
  }

  if (accessLoading && !hasResolvedAccessOnce) {
    return <FullScreenSpinner label={t('loadingAccess')} />;
  }

  if (!accessApproved) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10 text-foreground">
        <div className="relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="max-w-xl rounded-xl border border-border bg-card p-8 shadow-card">
            <div className="mb-5 flex items-center gap-3">
              <CompanyMark name={PRODUCT_NAME} size={40} priority />
              <div>
                <p className="text-sm font-semibold text-foreground">{PRODUCT_NAME}</p>
                <p className="text-sm text-muted-foreground">{getTranslation('stock.layout.stockAccess', language)}</p>
              </div>
            </div>
            <h1 className="page-title">{t('waitingApproval')}</h1>
            <p className="mt-3 text-muted-foreground">{accessMessage}</p>
            <p className="mt-3 text-sm text-muted-foreground">{t('waitingDetails')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={handleStockLogout} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">{t('logout')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className={CLASSES.shell}>
      <StockSidebar
        classes={{ ...CLASSES, sidebar: `${CLASSES.sidebar} ${sidebarCollapsed ? 'w-[4.5rem]' : 'w-60'}` }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        t={t}
        language={language}
        toggleLanguage={toggleLanguage}
        setNotificationOpen={notificationsState.setNotificationOpen}
        unreadCount={notificationsState.unreadCount}
        navigationItems={navEditing && !sidebarCollapsed ? arrangedNav : visibleNav}
        navEditing={navEditing}
        setNavEditing={setNavEditing}
        onNavChange={saveNav}
        onNavReset={navLayout.reset}
        lockedNav={ALWAYS_SHOWN}
        isActiveRoute={isActiveRoute}
        user={user}
        setTheme={setTheme}
        isDarkTheme={isDarkTheme}
        handleStockLogout={handleStockLogout}
        tenant={accessTenant}
        tenants={accessTenants}
      />

      <div className={`relative z-10 flex min-h-screen flex-col transition-[padding] duration-200 print:!pl-0 ${sidebarCollapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-60'}`}>
        {/* Printing an invoice prints the invoice, not the app around it. */}
        <div className="contents print:hidden">
        <StockTopbar
          t={t}
          language={language}
          toggleLanguage={toggleLanguage}
          setNotificationOpen={notificationsState.setNotificationOpen}
          unreadCount={notificationsState.unreadCount}
          setTheme={setTheme}
          isDarkTheme={isDarkTheme}
          handleStockLogout={handleStockLogout}
          dashboardSearchRef={dashboardSearchRef}
          accessRole={accessRole}
          primaryModifierLabel={primaryModifierLabel}
          navigationItems={visibleNav}
          isActiveRoute={isActiveRoute}
          tenant={accessTenant}
        />
        </div>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1600px]">
            {accessRole === 'salesperson' ? (
              <div className="print:hidden">
                <ClockInReminder t={t} onAttendancePage={isActiveRoute('/stock/attendance')} />
              </div>
            ) : null}
            {children}
          </div>
        </main>

        <footer className="mx-auto w-full max-w-[1600px] px-4 pb-6 pt-2 sm:px-6 lg:px-8 print:hidden">
          <p className="flex flex-wrap items-center gap-x-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{tc.brandFull}</span>
            <span aria-hidden="true">·</span>
            <span>{t('footerTitle')}</span>
            <button type="button" onClick={() => setShortcutsOpen(true)} className="ml-auto hidden rounded hover:text-foreground lg:inline">
              {language === 'hi' ? 'कीबोर्ड शॉर्टकट' : 'Keyboard shortcuts'} <kbd className="ml-1 rounded border border-border bg-card px-1 font-sans">?</kbd>
            </button>
          </p>
        </footer>
      </div>

      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} isApple={isApplePlatform} language={language} />

      <StockNotificationsSheet
        t={t}
        accessRole={accessRole}
        notificationOpen={notificationsState.notificationOpen}
        setNotificationOpen={notificationsState.setNotificationOpen}
        unreadCount={notificationsState.unreadCount}
        notifications={notificationsState.notifications}
        notificationLoading={notificationsState.notificationLoading}
        notificationError={notificationsState.notificationError}
        notificationUpdating={notificationsState.notificationUpdating}
        showNotificationDebug={notificationsState.showNotificationDebug}
        setShowNotificationDebug={notificationsState.setShowNotificationDebug}
        markAllNotificationsRead={notificationsState.markAllNotificationsRead}
        handleNotificationNavigate={notificationsState.handleNotificationNavigate}
      />
    </div>
    </TooltipProvider>
  );
}
