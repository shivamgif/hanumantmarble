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
      className={`group flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all duration-500 ${
        IsActive
          ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-xl scale-[1.02] orange-glow'
          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-500 ${
        IsActive
          ? 'bg-brand-primary/10 text-brand-primary'
          : 'text-slate-400 group-hover:text-brand-primary'
      }`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[10px] font-black uppercase tracking-[0.2em]">{Label}</span>
      {IsActive && (
        <div className="ml-auto w-1 h-4 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(224,122,0,0.5)]" />
      )}
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
    <aside className={`${classes.sidebar} glass-panel border-r-0 shadow-2xl flex flex-col`}>
      {/* Logo */}
      <div className="flex h-20 shrink-0 items-center gap-4 px-6 mb-4">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="Hanumant Marble logo"
            width={28}
            height={28}
            className="object-contain p-0.5"
            priority
          />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black tracking-[0.3em] text-slate-400 dark:text-slate-500 uppercase">Hanumant</p>
          <p className="truncate text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">{t('brand')}</p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
        <nav className="space-y-2">
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
      <div className="shrink-0 p-4 space-y-4">
        {/* Governance Block */}
        <div className="p-4 rounded-[2rem] bg-slate-50/50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/50 space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 transition-all hover:border-brand-primary/30 hover:text-brand-primary active:scale-95"
            >
              <Languages className="h-3.5 w-3.5" />
              <span>{language.toUpperCase()}</span>
            </button>
            <button
              type="button"
              onClick={() => setNotificationOpen(true)}
              className="relative h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all hover:border-brand-primary/30 hover:text-brand-primary active:scale-95"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-lg border-2 border-white dark:border-slate-800">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all hover:border-brand-primary/30 hover:text-brand-primary active:scale-95"
            >
              {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-[11px] font-black text-brand-primary border border-brand-primary/10">
              {(user?.email?.[0] ?? '?').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter opacity-80">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleStockLogout}
              className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-all"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
