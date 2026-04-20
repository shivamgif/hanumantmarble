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
  navigationItems,
  isActiveRoute,
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/20 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-2">
        <div className="hidden items-center justify-between gap-4 md:flex">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{tc.erpWorkspace}</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{tc.stockOpsApprovals}</p>
          </div>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
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
              className="w-80 rounded-xl border-none bg-slate-100 px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:bg-slate-900 dark:text-slate-200"
            />
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400" aria-label={`${primaryModifierAriaLabel} K`}>{primaryModifierLabel}+K</span>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400" aria-label={`${primaryModifierAriaLabel} Shift P`}>{primaryModifierLabel}+SHIFT+P</span>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400" aria-label={`${primaryModifierAriaLabel} Shift D`}>{primaryModifierLabel}+SHIFT+D</span>
          </div>
        </div>

        <div className="space-y-2 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/stock" className="inline-flex min-w-0 items-center gap-2" aria-label={tc.dashboardAria}>
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
              aria-label={tc.openNotifications}
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
              aria-label={isDarkTheme ? tc.switchToLight : tc.switchToDark}
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

          <nav className="flex items-center justify-center gap-5" aria-label={tc.mobileNav}>
            {navigationItems.map((item) => {
              const active = isActiveRoute(item.href);
              let mobileLabel;
              if (item.href === '/stock/admin') {
                mobileLabel = tc.adminHub;
              } if (item.href === '/stock/analytics') {
                mobileLabel = tc.analytics;
              } else {
                mobileLabel = tc.dashboard;
              }

              return (
                <Link
                  key={`mobile-top-${item.href}`}
                  href={item.href}
                  aria-label={mobileLabel}
                  title={mobileLabel}
                  className={`inline-flex h-8 items-center justify-between gap-2 rounded-xl border px-2 text-xs font-semibold transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 ${active ? 'border-[#E07A00]/30 bg-[#E07A00]/10 text-[#E07A00]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
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
  );
}
