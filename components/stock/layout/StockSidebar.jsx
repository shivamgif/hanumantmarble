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
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
        IsActive
          ? 'bg-[#E07A00]/10 text-[#E07A00]'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
      }`}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
        IsActive
          ? 'bg-[#E07A00]/15 text-[#E07A00]'
          : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
      }`}>
        <Icon className="h-4 w-4" />
      </span>
      <span>{Label}</span>
      {IsActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#E07A00]" />}
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
    <aside className={`${classes.sidebar} flex flex-col`}>
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-4 dark:border-white/30">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
          <Image
            src="/logo.png"
            alt="Hanumant Marble logo"
            fill
            sizes="36px"
            className="object-contain p-0.5"
            priority
          />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-bold tracking-[0.25em] text-slate-400 dark:text-slate-500">HANUMANT</p>
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{t('brand')}</p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="space-y-0.5">
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

      {/* Bottom controls */}
      <div className="shrink-0 border-t border-slate-100 px-3 py-3 dark:border-white/30 space-y-2">
        {/* Action row */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition-colors hover:border-[#E07A00]/30 hover:bg-[#E07A00]/8 hover:text-[#E07A00] dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-[#E07A00]/10 dark:hover:text-[#E07A00]"
            aria-label={language === 'en' ? t('switchToHindi') : t('switchToEnglish')}
          >
            <Languages className="h-3.5 w-3.5" />
            <span>{language.toUpperCase()}</span>
          </button>
          <button
            type="button"
            onClick={() => setNotificationOpen(true)}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:border-[#E07A00]/30 hover:bg-[#E07A00]/8 hover:text-[#E07A00] dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-[#E07A00]/10 dark:hover:text-[#E07A00]"
            aria-label={tc.openNotifications}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white py-0.5">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:border-[#E07A00]/30 hover:bg-[#E07A00]/8 hover:text-[#E07A00] dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-[#E07A00]/10 dark:hover:text-[#E07A00]"
            title={isDarkTheme ? tc.switchToLight : tc.switchToDark}
            aria-label={isDarkTheme ? tc.switchToLight : tc.switchToDark}
          >
            {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          </button>
        </div>

        {/* User + logout */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E07A00]/15 text-[10px] font-bold text-[#E07A00] select-none">
            {(user?.email?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={handleStockLogout}
            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
            title={t('logout')}
            aria-label={t('logout')}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
