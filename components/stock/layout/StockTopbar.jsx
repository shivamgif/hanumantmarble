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
    <header className="sticky top-0 z-20 border-b border-slate-200/30 bg-white/60 backdrop-blur-2xl dark:border-white/5 dark:bg-slate-950/60">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Desktop bar */}
        <div className="hidden h-20 items-center justify-between gap-10 px-8 md:flex">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500 mb-1">{tc.erpWorkspace}</p>
            <p className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">{tc.stockOpsApprovals}</p>
          </div>

          <div className="flex flex-1 items-center justify-end gap-6">
            <div className="relative flex items-center group">
              <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400 group-focus-within:text-brand-primary transition-colors duration-300" />
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
                className="h-11 w-80 rounded-2xl border border-slate-100 bg-white pl-11 pr-4 text-sm font-bold text-slate-900 outline-none transition-all duration-300 focus:border-brand-primary/30 focus:ring-4 focus:ring-brand-primary/5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-brand-primary/30"
              />
            </div>

            {/* Enhanced keyboard shortcuts display */}
            <div className="hidden lg:flex items-center gap-3" aria-label="Keyboard shortcuts">
              {[
                { 
                  id: 'search',
                  label: 'Search', 
                  keys: [primaryModifierLabel, 'K'],
                  color: 'text-brand-primary',
                  bg: 'bg-brand-primary/5 border-brand-primary/10'
                },
                { 
                  id: 'purchase',
                  label: 'Purchase', 
                  keys: [primaryModifierLabel, 'SHIFT', 'P'],
                  color: 'text-emerald-600',
                  bg: 'bg-emerald-500/5 border-emerald-500/10'
                },
                { 
                  id: 'dispatch',
                  label: 'Dispatch', 
                  keys: [primaryModifierLabel, 'SHIFT', 'D'],
                  color: 'text-amber-600',
                  bg: 'bg-amber-500/5 border-amber-500/10'
                },
              ].map((group) => (
                <div 
                  key={group.id} 
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${group.bg} backdrop-blur-md transition-all duration-300 hover:scale-[1.02] shadow-sm`}
                >
                  <span className={`text-[9px] font-black uppercase tracking-wider ${group.color} opacity-80`}>
                    {group.label}
                  </span>
                  <div className="flex gap-1 items-center">
                    {group.keys.map((k, i) => (
                      <kbd 
                        key={i} 
                        className="min-w-[22px] h-5 flex items-center justify-center rounded-md border border-slate-200 bg-white px-1.5 text-[8px] font-black text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 uppercase leading-none transition-colors group-hover:border-brand-primary/30"
                      >
                        {k.replace('+', '').trim()}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile bar */}
        <div className="md:hidden">
          <div className="flex h-16 items-center justify-between gap-4 px-6">
            <Link href="/stock" className="flex items-center gap-3 min-w-0" aria-label={tc.dashboardAria}>
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center">
                <Image src="/logo.png" alt="Hanumant Marble logo" width={22} height={22} className="object-contain" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black tracking-[0.2em] text-slate-400 uppercase">Hanumant</p>
                <p className="truncate text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">{t('brand')}</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {[
                { onClick: toggleLanguage, icon: <Languages className="h-4 w-4" />, badge: null },
                { onClick: () => setNotificationOpen(true), icon: <Bell className="h-4 w-4" />, badge: unreadCount > 0 ? unreadCount : null },
                { onClick: () => setTheme(isDarkTheme ? 'light' : 'dark'), icon: isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />, badge: null },
                { onClick: handleStockLogout, icon: <LogOut className="h-4 w-4" />, badge: null },
              ].map((btn, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={btn.onClick}
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 shadow-sm transition-all active:scale-90 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                >
                  {btn.icon}
                  {btn.badge != null && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] h-4.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-black leading-none text-white shadow-lg border border-white dark:border-slate-800">
                      {btn.badge > 99 ? '99+' : btn.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <nav className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100/50 px-4 py-3 dark:border-white/5 scrollbar-none" aria-label={tc.mobileNav}>
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
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${
                    active 
                      ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-lg orange-glow' 
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
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
