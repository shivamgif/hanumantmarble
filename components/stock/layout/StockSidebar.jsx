'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Bell, Languages, MoonStar, SunMedium, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

function SidebarNavItem({ Icon, Label, Href, IsActive, Collapsed }) {
  return (
    <Link
      href={Href}
      title={Label}
      aria-label={Label}
      className={`group flex items-center gap-3 rounded-xl py-3.5 transition-colors duration-200 focus-ring ${
        Collapsed ? 'justify-center px-0' : 'px-4'
      } ${
        IsActive
          ? 'bg-brand-primary/10 text-brand-primary'
          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-muted/60'
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
        IsActive
          ? 'bg-brand-primary/10 text-brand-primary'
          : 'text-slate-400 group-hover:text-brand-primary'
      }`}>
        <Icon className="h-4 w-4" />
      </span>
      {!Collapsed && (
        <>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">{Label}</span>
          {IsActive && <div className="ml-auto w-1 h-4 rounded-full bg-brand-primary" />}
        </>
      )}
    </Link>
  );
}

export default function StockSidebar({
  classes,
  t,
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
  collapsed,
  onToggleCollapse,
}) {
  const iconButtonClass = 'h-10 w-10 flex items-center justify-center rounded-xl border border-border bg-card text-slate-600 dark:text-slate-300 transition-all hover:border-brand-primary/30 hover:text-brand-primary active:scale-95 focus-ring';
  const collapseLabel = collapsed ? t('expandSidebar') : t('collapseSidebar');

  return (
    <aside className={`${classes.sidebar} glass-panel border-y-0 border-l-0 shadow-none flex flex-col`}>
      {/* Logo */}
      <div className={`flex shrink-0 items-center mb-4 ${collapsed ? 'flex-col gap-3 px-3 pt-4' : 'h-20 gap-4 px-6'}`}>
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
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-[0.3em] text-slate-400 dark:text-slate-500 uppercase">Hanumant</p>
            <p className="truncate text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">{t('brand')}</p>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapseLabel}
              aria-expanded={!collapsed}
              className={`h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-brand-primary focus-ring ${collapsed ? '' : 'ml-auto'}`}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapseLabel}</TooltipContent>
        </Tooltip>
      </div>

      {/* Nav */}
      <div className={`flex-1 overflow-y-auto py-2 custom-scrollbar ${collapsed ? 'px-3' : 'px-4'}`}>
        <nav className="space-y-2">
          {navigationItems.map((item) => (
            <SidebarNavItem
              key={item.href}
              Icon={item.icon}
              Label={item.label}
              Href={item.href}
              IsActive={isActiveRoute(item.href)}
              Collapsed={collapsed}
            />
          ))}
        </nav>
      </div>

      {/* Bottom controls */}
      <div className={`shrink-0 py-4 space-y-4 ${collapsed ? 'px-3' : 'px-4'}`}>
        <div className="border-t border-border/60 mx-2" />

        {/* Governance Block */}
        <div className={`rounded-2xl space-y-4 ${collapsed ? '' : 'p-4 bg-muted/40 border border-border/60'}`}>
          <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={language.toUpperCase()}
              className={collapsed ? iconButtonClass : 'flex-1 h-10 flex items-center justify-center gap-2 rounded-xl border border-border bg-card text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 transition-all hover:border-brand-primary/30 hover:text-brand-primary active:scale-95 focus-ring'}
            >
              <Languages className="h-3.5 w-3.5" />
              {!collapsed && <span>{language.toUpperCase()}</span>}
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setNotificationOpen(true)}
                  aria-label={t('notifications')}
                  className={`relative ${iconButtonClass}`}
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white border-2 border-white dark:border-slate-800">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('notifications')}</TooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              className={iconButtonClass}
            >
              {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
          </div>

          <div className={`flex items-center rounded-xl ${collapsed ? 'flex-col gap-2' : 'gap-3 p-3 bg-card border border-border/60 shadow-card'}`}>
            <div
              title={user?.email}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-[11px] font-black text-brand-primary border border-brand-primary/10"
            >
              {(user?.email?.[0] ?? '?').toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter opacity-80">{user?.email}</p>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleStockLogout}
                  aria-label={t('logout')}
                  className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-all focus-ring"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('logout')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </aside>
  );
}
