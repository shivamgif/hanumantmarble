'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BarChart2, Home, Users } from 'lucide-react';
import { getLogoutHref, useAuthUser } from '@/lib/auth-client';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import BrandedLoginPage from '@/components/BrandedLoginPage';

import { useStockAccess } from '@/hooks/useStockAccess';
import { useStockNotifications } from '@/hooks/useStockNotifications';
import { useStockShortcuts } from '@/hooks/useStockShortcuts';

import StockSidebar from '@/components/stock/layout/StockSidebar';
import StockTopbar from '@/components/stock/layout/StockTopbar';
import StockNotificationsSheet from '@/components/stock/layout/StockNotificationsSheet';

const CLASSES = {
  shell: 'relative min-h-screen bg-slate-50/80 font-sans text-slate-900 dark:bg-[#0b0f1a] dark:text-slate-100',
  sidebar: 'fixed inset-y-0 left-0 z-30 hidden h-screen w-60 border-r border-slate-200/30 bg-white lg:flex lg:flex-col dark:border-white/8 dark:bg-slate-950',
};

export default function StockLayout({ children }) {
  const { user, isLoading, error } = useAuthUser();
  const { language, toggleLanguage } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const dashboardSearchRef = useRef(null);
  const [dashboardSearchValue, setDashboardSearchValue] = useState('');

  const { accessLoading, hasResolvedAccessOnce, accessApproved, accessMessage, accessRole } = useStockAccess(user);

  const notificationsState = useStockNotifications({ user, accessApproved });
  const { isApplePlatform } = useStockShortcuts({ dashboardSearchRef });

  const t = (key) => getTranslation(`stock.layout.${key}`, language);
  const tc = {
    brandFull: language === 'hi' ? 'हनुमंत मार्बल' : 'Hanumant Marble',
    stockAccess: language === 'hi' ? 'स्टॉक प्रबंधन पहुंच' : 'Stock management access',
    openNotifications: language === 'hi' ? 'सूचनाएं खोलें' : 'Open notifications',
    switchToLight: language === 'hi' ? 'लाइट थीम में बदलें' : 'Switch to light theme',
    switchToDark: language === 'hi' ? 'डार्क थीम में बदलें' : 'Switch to dark theme',
    light: language === 'hi' ? 'लाइट' : 'Light',
    dark: language === 'hi' ? 'डार्क' : 'Dark',
    erpWorkspace: language === 'hi' ? 'ईआरपी कार्यक्षेत्र' : 'ERP Workspace',
    stockOpsApprovals: language === 'hi' ? 'स्टॉक संचालन और अनुमोदन' : 'Stock operations and approvals',
    searchHub: language === 'hi' ? 'हब खोजें (CMD+K)' : 'Search Hub (CMD+K)',
    dashboardAria: language === 'hi' ? 'हनुमंत मार्बल स्टॉक डैशबोर्ड' : 'Hanumant Marble stock dashboard',
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
    searchHint: language === 'hi' ? 'खोजें या कमांड चलाएं…' : 'Search or run commands…',
  };

  const isDarkTheme = resolvedTheme === 'dark';
  const primaryModifierLabel = isApplePlatform ? 'CMD + ' : 'Ctrl + ';
  const shiftModifierLabel = isApplePlatform ? 'Shift +' : 'Shift + ';
  const primaryModifierAriaLabel = isApplePlatform ? 'Command' : 'Control';
  const isUnauthorizedError = error?.message === 'Unauthorized' || error?.status === 401;

  function handleStockLogout() {
    document.cookie = `hm-login-return-to=${encodeURIComponent('/stock')}; Path=/; Max-Age=300; SameSite=Lax`;
    window.location.href = getLogoutHref(window.location.origin);
  }

  const navigationItems = [
    { href: '/stock', label: t('dashboard'), icon: Home },
  ];

  if (accessRole === 'admin' || accessRole === 'manager') {
    navigationItems.push({ href: '/stock/admin', label: t('adminDashboard'), icon: Users });
  }
  if (accessRole === 'manager' || accessRole === 'salesperson') {
    navigationItems.push({ href: '/stock/analytics', label: t('analytics'), icon: BarChart2 });
  }

  const isActiveRoute = (href) => {
    const cleanHref = href.split('#')[0];
    if (cleanHref === '/stock') {
      return pathname === '/stock';
    }
    return pathname?.startsWith(cleanHref);
  };

  function runDashboardSearch(rawQuery) {
    const query = String(rawQuery || '').trim().toLowerCase();
    if (!query) {
      return;
    }

    if (query.includes('new purchase') || query.includes('new arrival') || query === 'np') {
      router.push('/stock?view=purchases&new=purchase');
      return;
    }

    if (query.includes('new dispatch') || query === 'nd') {
      router.push('/stock?view=dispatches&new=dispatch');
      return;
    }

    if (query.includes('purchase') || query.includes('arrival') || query.includes('inbound')) {
      router.push('/stock?view=purchases');
      return;
    }

    if (query.includes('dispatch') || query.includes('outbound')) {
      router.push('/stock?view=dispatches');
      return;
    }

    if (query.includes('item') || query.includes('stock') || query.includes('inventory')) {
      router.push('/stock?view=items');
      return;
    }

    if (query.includes('document')) {
      router.push('/stock/documents');
      return;
    }

    if (query.includes('approval') || query.includes('change request')) {
      router.push('/stock/admin?focus=change-requests');
      return;
    }

    if (query.includes('admin') || query.includes('analytics') || query.includes('user')) {
      router.push('/stock/admin');
      return;
    }

    router.push('/stock');
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-[#0b0f1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#E07A00] dark:border-slate-700 dark:border-t-[#E07A00]" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
        </div>
      </div>
    );
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
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-[#0b0f1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#E07A00] dark:border-slate-700 dark:border-t-[#E07A00]" />
          <p className="text-sm text-slate-400 dark:text-slate-500">{t('loadingAccess')}</p>
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
                  className="object-contain"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{language === 'hi' ? 'हनुमंत मार्बल' : 'Hanumant Marble'}</p>
                <p className="text-sm text-muted-foreground">{getTranslation('stock.layout.stockAccess', language)}</p>
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

      <StockSidebar
        classes={CLASSES}
        t={t}
        language={language}
        toggleLanguage={toggleLanguage}
        setNotificationOpen={notificationsState.setNotificationOpen}
        unreadCount={notificationsState.unreadCount}
        navigationItems={navigationItems}
        isActiveRoute={isActiveRoute}
        user={user}
        setTheme={setTheme}
        isDarkTheme={isDarkTheme}
        handleStockLogout={handleStockLogout}
      />

      <div className="relative z-10 flex min-h-screen flex-col lg:pl-60">
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
          dashboardSearchValue={dashboardSearchValue}
          setDashboardSearchValue={setDashboardSearchValue}
          runDashboardSearch={runDashboardSearch}
          primaryModifierAriaLabel={primaryModifierAriaLabel}
          primaryModifierLabel={primaryModifierLabel}
          shiftModifierLabel={shiftModifierLabel}
          navigationItems={navigationItems}
          isActiveRoute={isActiveRoute}
        />

        <main className="flex-1 px-3 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>

        <footer className="mx-auto mb-8 w-full max-w-[1600px] px-3 sm:px-8 lg:px-12">
          <div className="rounded-3xl sm:rounded-[2rem] border border-slate-100 bg-white/40 px-5 py-4 sm:px-8 sm:py-5 text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:border-white/5 dark:bg-slate-950/40 dark:text-slate-600 shadow-sm backdrop-blur-md">
            <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <span className="text-brand-primary opacity-60">Operational Protocol</span>
              <span className="hidden sm:inline opacity-20">•</span>
              <span>{t('footerTitle')}</span>
              <span className="hidden sm:inline opacity-20">•</span>
              <span className="text-slate-900 dark:text-slate-300">Live Status: Stable</span>
              <span className="hidden sm:inline opacity-20">•</span>
              <span className="hidden sm:inline">{t('footerUpdated')}: {new Date().toLocaleString()}</span>
            </p>
          </div>
        </footer>
      </div>

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
  );
}
