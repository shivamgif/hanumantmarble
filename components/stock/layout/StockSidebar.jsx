'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Bell, Languages, MoonStar, SunMedium, LogOut } from 'lucide-react';

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

export default function StockSidebar({
  classes,
  t,
  tc,
  language,
  toggleLanguage,
  setNotificationOpen,
  unreadCount,
  navigationItems,
  isActiveRoute,
  user,
  setTheme,
  isDarkTheme,
  handleStockLogout,
}) {
  return (
    <aside className={classes.sidebar}>
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
            aria-label={tc.openNotifications}
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
            title={isDarkTheme ? tc.switchToLight : tc.switchToDark}
            aria-label={isDarkTheme ? tc.switchToLight : tc.switchToDark}
          >
            {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            <span className="text-xs">{isDarkTheme ? tc.light : tc.dark}</span>
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
  );
}
