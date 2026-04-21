'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Bell, Languages, MoonStar, SunMedium, LogOut, Search } from 'lucide-react';

export default function StockTopbar({
  tc,
  t,
  language,
  toggleLanguage,
  setNotificationOpen,
  unreadCount,
  setTheme,
  isDarkTheme,
  handleStockLogout,
  dashboardSearchRef,
  dashboardSearchValue,
  setDashboardSearchValue,
  runDashboardSearch,
  primaryModifierAriaLabel,
  primaryModifierLabel,
  shiftModifierLabel,
  navigationItems,
  isActiveRoute,
}) {

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/30 bg-white/90 backdrop-blur-md dark:border-white/8 dark:bg-slate-950/90">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Desktop bar */}
        <div className="hidden h-14 items-center justify-between gap-6 px-6 md:flex lg:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">{tc.erpWorkspace}</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{tc.stockOpsApprovals}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={dashboardSearchRef}
                type="text"
                placeholder={tc.searchHint}
                value={dashboardSearchValue}
                onChange={(event) => setDashboardSearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    runDashboardSearch(dashboardSearchValue);
                    setDashboardSearchValue('');
                  }
                }}
                className="h-9 w-72 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-700 outline-none transition-all focus:border-[#E07A00]/40 focus:ring-2 focus:ring-[#E07A00]/15 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-[#E07A00]/30"
              />
            </div>
            {/* Improved keyboard shortcuts display */}
            <div className="flex items-center gap-2" aria-label="Keyboard shortcuts">
              <div className="flex items-center gap-1 group relative">
                <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">{primaryModifierLabel} K</kbd>
                <span className="hidden group-hover:block absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">Quick Search</span>
              </div>
              <div className="flex items-center gap-1 group relative">
                <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">{primaryModifierLabel} {shiftModifierLabel} P</kbd>
                <span className="hidden group-hover:block absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">Open Purchases</span>
              </div>
              <div className="flex items-center gap-1 group relative">
                <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">{primaryModifierLabel} {shiftModifierLabel} D</kbd>
                <span className="hidden group-hover:block absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">Open Dispatches</span>
              </div>
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">Shortcuts</span>
            </div>
          </div>
        </div>

        {/* Mobile bar */}
        <div className="md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link href="/stock" className="inline-flex min-w-0 items-center gap-2.5" aria-label={tc.dashboardAria}>
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
                <Image src="/logo.png" alt="Hanumant Marble logo" fill sizes="32px" className="object-contain p-0.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[0.2em] text-slate-400 dark:text-slate-500">HANUMANT</p>
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{t('brand')}</p>
              </div>
            </Link>

            <div className="flex items-center gap-1.5">
              {[
                { onClick: toggleLanguage, label: language === 'en' ? t('switchToHindi') : t('switchToEnglish'), children: <Languages className="h-4 w-4" />, badge: null },
                { onClick: () => setNotificationOpen(true), label: tc.openNotifications, children: <Bell className="h-4 w-4" />, badge: unreadCount > 0 ? unreadCount : null },
                { onClick: () => setTheme(isDarkTheme ? 'light' : 'dark'), label: isDarkTheme ? tc.switchToLight : tc.switchToDark, children: isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />, badge: null },
                { onClick: handleStockLogout, label: t('logout'), children: <LogOut className="h-4 w-4" />, badge: null },
              ].map((btn, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={btn.onClick}
                  className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors active:scale-95 hover:border-[#E07A00]/30 hover:bg-[#E07A00]/8 hover:text-[#E07A00] dark:border-white/10 dark:bg-slate-900 dark:text-slate-400"
                  aria-label={btn.label}
                >
                  {btn.children}
                  {btn.badge != null && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white py-0.5">
                      {btn.badge > 99 ? '99+' : btn.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <nav className="flex items-center gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 dark:border-white/8 scrollbar-none" aria-label={tc.mobileNav}>
            {navigationItems.map((item) => {
              const active = isActiveRoute(item.href);
              let mobileLabel;
              if (item.href === '/stock/admin') mobileLabel = tc.adminHub;
              else if (item.href === '/stock/analytics') mobileLabel = tc.analytics;
              else mobileLabel = tc.dashboard;

              return (
                <Link
                  key={`mobile-top-${item.href}`}
                  href={item.href}
                  aria-label={mobileLabel}
                  title={mobileLabel}
                  className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-all active:scale-95 ${active ? 'bg-[#E07A00]/10 text-[#E07A00]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                >
                  <item.icon className="h-3 w-3" />
                  <span>{mobileLabel}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
