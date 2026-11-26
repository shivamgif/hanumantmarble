'use client';

import Link from 'next/link';
import { Bell, Check, ChevronsUpDown, Eye, EyeOff, GripVertical, Languages, MoonStar, RotateCcw, SlidersHorizontal, SunMedium, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { DragGhost, usePointerSort } from '@/hooks/usePointerSort';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { CompanyMark } from '@/components/ui/brand-mark';
import { TENANT_COOKIE } from '@/lib/tenant-cookie';

// Dashboard is always the first link: no grip, and nothing drops above it.
const PINNED_NAV = new Set(['/stock']);
const navId = (item) => item.href;
// Grip and hide show on hover or keyboard focus, and always on touch screens.
const NAV_REVEAL = 'opacity-0 transition-opacity group-hover/nav:opacity-100 group-focus-within/nav:opacity-100 [@media(hover:none)]:opacity-100';

function SidebarNavItem({ Icon, Label, Href, IsActive, Collapsed }) {
  return (
    <Link
      href={Href}
      title={Label}
      aria-label={Label}
      aria-current={IsActive ? 'page' : undefined}
      className={`group relative flex h-10 items-center gap-2 rounded-lg text-sm transition-colors duration-150 focus-ring ${
        Collapsed ? 'justify-center px-0' : 'px-4'
      } ${
        IsActive
          ? 'bg-muted font-semibold text-slate-900 dark:text-slate-50'
          : 'font-medium text-slate-500 hover:bg-muted hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
      }`}
    >
      {/* Saffron rule on the active page: the only accent in the rail. */}
      {IsActive && <span aria-hidden="true" className="absolute inset-y-2 -left-px w-[3px] rounded-r-lg bg-foreground" />}
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
  tenant,
  tenants = [],
  allNavItems = navigationItems,
  onNavChange,
  onNavReset,
  lockedNav,
}) {
  const iconButtonClass = 'h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition-colors hover:bg-muted hover:text-slate-900 dark:hover:text-slate-100 focus-ring';
  const collapseLabel = collapsed ? t('expandSidebar') : t('collapseSidebar');
  // Links reorder in place by their grip; Dashboard stays first. The sort
  // works on every link, hidden ones too, so they keep their place.
  const sort = usePointerSort(allNavItems, onNavChange, {
    scope: 'nav',
    getId: navId,
    isVisible: (item) => !item.hidden,
    pinned: PINNED_NAV,
  });
  const shownNav = collapsed ? navigationItems : sort.list.filter((item) => !item.hidden);
  const hiddenNav = allNavItems.filter((item) => item.hidden);
  const setHidden = (href, hidden) => onNavChange(allNavItems.map((item) => (item.href === href ? { ...item, hidden } : item)));

  return (
    <aside className={`${classes.sidebar} border-r border-border flex flex-col`}>
      {/* Logo */}
      <div className={`flex shrink-0 items-center mb-2 ${collapsed ? 'flex-col gap-2 px-4 pt-4' : 'h-16 gap-2 pl-4 pr-2'}`}>
        <CompanyMark name={tenant?.name} logo={tenant?.logo} logoDark={tenant?.logoDark} size={28} priority />
        {!collapsed && (
          <div className="min-w-0">
            {tenants.length > 1 ? (
              // Someone on several companies' staff picks which one to work in.
              // The cookie only chooses; the server still checks the staff row.
              <DropdownMenu>
                <DropdownMenuTrigger className="flex w-full items-center gap-1 rounded-lg text-left text-sm font-semibold leading-tight tracking-tight text-slate-900 focus-ring dark:text-slate-50">
                  <span className="truncate">{tenant?.name}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Switch company</DropdownMenuLabel>
                  {tenants.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      onSelect={() => {
                        if (option.id === tenant?.id) return;
                        document.cookie = `${TENANT_COOKIE}=${option.id}; Path=/; Max-Age=31536000; SameSite=Lax`;
                        window.location.assign('/stock');
                      }}
                      className="gap-2"
                    >
                      <CompanyMark name={option.name} size={20} />
                      <span className="flex-1 truncate">{option.name}</span>
                      {option.id === tenant?.id ? <Check className="h-4 w-4 text-brand-primary" aria-hidden="true" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <p className="truncate text-sm font-semibold tracking-tight leading-tight text-slate-900 dark:text-slate-50">{tenant?.name}</p>
            )}
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
              className={`h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-muted hover:text-slate-900 dark:hover:text-slate-100 focus-ring ${collapsed ? '' : 'ml-auto'}`}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapseLabel}</TooltipContent>
        </Tooltip>
      </div>

      {/* Nav */}
      <div className={`flex-1 overflow-y-auto py-2 custom-scrollbar ${collapsed ? 'px-4' : 'px-4'}`}>
        <nav className="space-y-1">
          {shownNav.map((item) => {
            const pinned = PINNED_NAV.has(item.href);
            const dragging = sort.dragId === item.href;
            return (
              <div
                key={item.href}
                data-sort-scope="nav"
                data-sort-id={item.href}
                className={`group/nav relative rounded-lg ${dragging ? 'opacity-60 outline-dashed outline-1 outline-border' : ''}`}
              >
                <SidebarNavItem
                  Icon={item.icon}
                  Label={item.label}
                  Href={item.href}
                  IsActive={isActiveRoute(item.href)}
                  Collapsed={collapsed}
                />
                {!collapsed && !pinned ? (
                  <button
                    {...sort.gripProps(item.href, `${t('dragToMove')}: ${item.label}`, item.label)}
                    className={`absolute inset-y-0 left-0 flex w-4 cursor-grab items-center justify-center rounded-l-lg text-muted-foreground focus-ring active:cursor-grabbing ${NAV_REVEAL}`}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {!collapsed && !lockedNav?.has(item.href) ? (
                  <button
                    type="button"
                    aria-label={`${t('hideLink')}: ${item.label}`}
                    title={t('hideLink')}
                    onClick={() => setHidden(item.href, true)}
                    className={`absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground focus-ring ${NAV_REVEAL}`}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </nav>
        <DragGhost ghost={sort.ghost} />
      </div>

      {/* Bottom controls */}
      <div className={`shrink-0 border-t border-border py-4 space-y-4 ${collapsed ? 'px-4' : 'px-4'}`}>

        {/* Governance Block */}
        <div className="space-y-4">
          <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={language.toUpperCase()}
              className={collapsed ? iconButtonClass : 'h-9 flex items-center gap-2 rounded-lg px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 transition-colors hover:bg-muted hover:text-slate-900 dark:hover:text-slate-100 focus-ring mr-auto'}
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
                    <span className="absolute right-0.5 top-0.5 inline-flex min-w-[16px] h-4 items-center justify-center rounded-lg bg-foreground px-1 text-[10px] font-semibold leading-none text-background ring-1 ring-background">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('notifications')}</TooltipContent>
            </Tooltip>
            {!collapsed ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label={t('customizeSidebar')} title={t('customizeSidebar')} className={`relative ${iconButtonClass}`}>
                    <SlidersHorizontal className="h-4 w-4" />
                    {hiddenNav.length > 0 ? (
                      <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-lg bg-muted px-1 text-[10px] font-semibold leading-none text-muted-foreground ring-1 ring-background">
                        {hiddenNav.length}
                      </span>
                    ) : null}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-60 p-2">
                  <p className="px-1 pb-1 text-[11px] text-muted-foreground">{t('sidebarHint')}</p>
                  <p className="px-1 pt-1 text-xs font-medium text-foreground">{t('hiddenLinks')}</p>
                  {hiddenNav.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">{t('noHiddenLinks')}</p>
                  ) : (
                    <ul className="py-1">
                      {hiddenNav.map((item) => (
                        <li key={item.href} className="flex items-center gap-2 rounded-md px-1 py-1 text-xs">
                          <item.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                          <span className="min-w-0 flex-1 truncate text-foreground">{item.label}</span>
                          <button
                            type="button"
                            onClick={() => setHidden(item.href, false)}
                            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
                          >
                            <Eye className="h-3 w-3" /> {t('showLink')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={onNavReset}
                    className="mt-1 flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> {t('resetLayout')}
                  </button>
                </PopoverContent>
              </Popover>
            ) : null}
            <button
              type="button"
              onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              aria-label={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
              className={iconButtonClass}
            >
              {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
          </div>

          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-2 px-1'}`}>
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
                  className="p-2 rounded-lg text-slate-400 hover:bg-muted hover:text-rose-600 dark:hover:text-rose-400 transition-colors focus-ring"
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
