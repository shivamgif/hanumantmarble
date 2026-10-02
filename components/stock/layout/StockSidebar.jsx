'use client';

import Link from 'next/link';
import { Bell, Languages, MoonStar, SunMedium, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BrandMark } from '@/components/ui/brand-mark';

function SidebarNavItem({ Icon, Label, Href, IsActive, Collapsed }) {
  return (
    <Link
      href={Href}
      title={Label}
      aria-label={Label}
      aria-current={IsActive ? 'page' : undefined}
      className={`group relative flex h-10 items-center gap-3 rounded-md text-sm transition-colors duration-150 focus-ring ${
        Collapsed ? 'justify-center px-0' : 'px-3'
      } ${
        IsActive
          ? 'bg-muted font-semibold text-slate-900 dark:text-slate-50'
          : 'font-medium text-slate-500 hover:bg-muted hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
      }`}
    >
      {/* Saffron rule on the active page: the only accent in the rail. */}
      {IsActive && <span aria-hidden="true" className="absolute inset-y-2 -left-px w-[3px] rounded-r bg-brand-primary" />}
      <Icon className={`h-[18px] w-[18px] shrink-0 ${IsActive ? 'text-brand-primary' : ''}`} strokeWidth={1.75} />
      {!Collapsed && <span className="truncate">{Label}</span>}
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
  const iconButtonClass = 'h-9 w-9 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 transition-colors hover:bg-muted hover:text-slate-900 dark:hover:text-slate-100 focus-ring';
  const collapseLabel = collapsed ? t('expandSidebar') : t('collapseSidebar');

  return (
    <aside className={`${classes.sidebar} border-r border-border flex flex-col`}>
      {/* Logo */}
      <div className={`flex shrink-0 items-center mb-2 ${collapsed ? 'flex-col gap-3 px-3 pt-4' : 'h-16 gap-2.5 pl-4 pr-2'}`}>
        <BrandMark size={28} priority />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight leading-tight text-slate-900 dark:text-slate-50">{language === 'hi' ? 'हनुमंत मार्बल' : 'Hanumant Marble'}</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{t('stockOpsApprovals')}</p>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapseLabel}
              aria-expanded={!collapsed}
              className={`h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-muted hover:text-slate-900 dark:hover:text-slate-100 focus-ring ${collapsed ? '' : 'ml-auto'}`}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapseLabel}</TooltipContent>
        </Tooltip>
      </div>

      {/* Nav */}
      <div className={`flex-1 overflow-y-auto py-2 custom-scrollbar ${collapsed ? 'px-3' : 'px-3'}`}>
        <nav className="space-y-0.5">
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
      <div className={`shrink-0 border-t border-border py-3 space-y-3 ${collapsed ? 'px-3' : 'px-3'}`}>

        {/* Governance Block */}
        <div className="space-y-3">
          <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={language.toUpperCase()}
              className={collapsed ? iconButtonClass : 'h-9 flex items-center gap-2 rounded-md px-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 transition-colors hover:bg-muted hover:text-slate-900 dark:hover:text-slate-100 focus-ring mr-auto'}
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
                    <span className="absolute right-0.5 top-0.5 inline-flex min-w-[16px] h-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-background">
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
              aria-label={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
              className={iconButtonClass}
            >
              {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
          </div>

          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-2.5 px-1'}`}>
            <div
              title={user?.email}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
            >
              {(user?.email?.[0] ?? '?').toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-600 dark:text-slate-300">{user?.email}</p>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleStockLogout}
                  aria-label={t('logout')}
                  className="p-2 rounded-md text-slate-400 hover:bg-muted hover:text-rose-600 dark:hover:text-rose-400 transition-colors focus-ring"
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
