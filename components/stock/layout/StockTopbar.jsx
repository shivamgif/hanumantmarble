'use client';

import { BrandMark } from '@/components/ui/brand-mark';
import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bell, Languages, MoonStar, SunMedium, LogOut, Search,
  PackageCheck, Truck, Boxes, FileText, Users, BarChart2,
  Home, PlusCircle, ArrowRight, X,
} from 'lucide-react';

// ─── Command catalogue ────────────────────────────────────────────────────────
// Each entry has: id, label, description, icon, href (used by runDashboardSearch)
const COMMANDS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Go to stock dashboard',
    icon: Home,
    keywords: ['home', 'dashboard', 'main', 'overview'],
    href: '/stock',
  },
  {
    id: 'new-purchase',
    label: 'New Purchase',
    description: 'Log a new inbound shipment',
    icon: PlusCircle,
    keywords: ['new purchase', 'new arrival', 'np', 'purchase', 'buy', 'inbound', 'arrival'],
    href: '/stock?view=purchases&new=purchase',
  },
  {
    id: 'new-dispatch',
    label: 'New Dispatch',
    description: 'Create a new outbound dispatch',
    icon: Truck,
    keywords: ['new dispatch', 'nd', 'dispatch', 'outbound', 'sell', 'send'],
    href: '/stock?view=dispatches&new=dispatch',
  },
  {
    id: 'purchases',
    label: 'Purchases',
    description: 'View all inbound shipments',
    icon: PackageCheck,
    keywords: ['purchases', 'arrivals', 'inbound', 'purchase list'],
    href: '/stock?view=purchases',
  },
  {
    id: 'dispatches',
    label: 'Dispatches',
    description: 'View all outbound dispatches',
    icon: Truck,
    keywords: ['dispatches', 'outbound', 'dispatch list'],
    href: '/stock?view=dispatches',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Browse current stock levels',
    icon: Boxes,
    keywords: ['inventory', 'items', 'stock', 'catalog', 'tiles'],
    href: '/stock?view=items',
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'View invoices and attached files',
    icon: FileText,
    keywords: ['documents', 'files', 'invoices', 'docs'],
    href: '/stock/documents',
  },
  {
    id: 'approvals',
    label: 'Approvals',
    description: 'Review pending change requests',
    icon: Users,
    keywords: ['approvals', 'change request', 'pending', 'review'],
    href: '/stock/admin?focus=change-requests',
  },
  {
    id: 'admin',
    label: 'Admin Hub',
    description: 'User management and settings',
    icon: Users,
    keywords: ['admin', 'users', 'settings', 'management'],
    href: '/stock/admin',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Sales and stock analytics',
    icon: BarChart2,
    keywords: ['analytics', 'reports', 'charts', 'data', 'stats'],
    href: '/stock/analytics',
  },
];

const DEFAULT_COMMANDS = COMMANDS.filter((c) =>
  ['dashboard', 'new-purchase', 'new-dispatch', 'purchases', 'dispatches', 'inventory'].includes(c.id)
);

function scoreCommand(cmd, query) {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const labelLower = cmd.label.toLowerCase();
  const descLower = cmd.description.toLowerCase();
  if (labelLower.startsWith(q)) return 100;
  if (cmd.keywords.some((k) => k === q)) return 90;
  if (labelLower.includes(q)) return 70;
  if (cmd.keywords.some((k) => k.startsWith(q))) return 60;
  if (cmd.keywords.some((k) => k.includes(q))) return 40;
  if (descLower.includes(q)) return 20;
  return 0;
}

// ─── SearchDropdown ───────────────────────────────────────────────────────────
function SearchDropdown({ query, onSelect, activeIndex, setActiveIndex }) {
  const results = query
    ? COMMANDS.map((c) => ({ ...c, score: scoreCommand(c, query) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
    : DEFAULT_COMMANDS;

  if (results.length === 0) {
    return (
      <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[320px] rounded-xl border border-border bg-popover p-4 shadow-card-hover">
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">No commands found for &ldquo;{query}&rdquo;</p>
      </div>
    );
  }

  return (
    <div
      className="absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[320px] overflow-hidden rounded-xl border border-border bg-popover shadow-card-hover"
      role="listbox"
      aria-label="Search suggestions"
    >
      {!query && (
        <div className="px-3 pb-1 pt-2.5">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Quick actions</p>
        </div>
      )}
      <ul className="max-h-72 overflow-y-auto p-1.5">
        {results.map((cmd, i) => {
          const Icon = cmd.icon;
          const isActive = i === activeIndex;
          return (
            <li key={cmd.id} role="option" aria-selected={isActive}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(cmd)}
                className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-100 ${
                  isActive
                    ? 'bg-muted'
                    : 'hover:bg-muted'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-slate-500 dark:text-slate-400">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                    {cmd.label}
                  </span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {cmd.description}
                  </span>
                </span>
                <ArrowRight className={`h-3 w-3 shrink-0 transition-opacity ${isActive ? 'text-brand-primary opacity-100' : 'opacity-0'}`} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border px-3 py-2">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">↑↓</kbd>
          {' '}navigate &nbsp;
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">↵</kbd>
          {' '}select &nbsp;
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">Esc</kbd>
          {' '}close
        </p>
      </div>
    </div>
  );
}

// ─── SearchBox ────────────────────────────────────────────────────────────────
function SearchBox({ dashboardSearchRef, runDashboardSearch, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  const results = query
    ? COMMANDS.map((c) => ({ ...c, score: scoreCommand(c, query) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
    : DEFAULT_COMMANDS;

  const handleSelect = useCallback((cmd) => {
    runDashboardSearch(cmd.keywords[0]);
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
  }, [runDashboardSearch]);

  const handleKeyDown = useCallback((e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        return;
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      dashboardSearchRef?.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      } else if (runDashboardSearch(query)) {
        setQuery('');
        setOpen(false);
      } else {
        // Nothing matched. Leave the query in place and keep the dropdown on
        // its "no commands found" state instead of navigating somewhere the
        // user did not ask for.
        setOpen(true);
      }
    }
  }, [open, results, activeIndex, query, dashboardSearchRef, handleSelect, runDashboardSearch]);

  // Close on outside click
  useEffect(() => {
    function onOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  return (
    <div ref={containerRef} className="relative flex items-center group">
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400 group-focus-within:text-slate-700 dark:group-focus-within:text-slate-200 transition-colors" />
      <input
        ref={dashboardSearchRef}
        id="topbar-search"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="topbar-search-listbox"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="h-9 w-44 lg:w-56 xl:w-72 rounded-md border border-border bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-150 focus:border-slate-400 focus:ring-2 focus:ring-brand-primary/15 dark:focus:border-slate-500"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { setQuery(''); setOpen(false); dashboardSearchRef?.current?.focus(); }}
          className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && (
        <SearchDropdown
          query={query}
          onSelect={handleSelect}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
        />
      )}
    </div>
  );
}

// ─── StockTopbar ──────────────────────────────────────────────────────────────
export default function StockTopbar({
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
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Desktop bar */}
        <div className="hidden h-14 items-center justify-between gap-4 xl:gap-8 px-8 lg:flex">
          <div className="min-w-0 shrink-0">
            <p className="truncate text-sm">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{t('erpWorkspace')}</span>
              <span className="mx-2 text-slate-300 dark:text-slate-600" aria-hidden="true">/</span>
              <span className="text-slate-500 dark:text-slate-400">{t('stockOpsApprovals')}</span>
            </p>
          </div>

          <div className="flex flex-1 items-center justify-end gap-4 lg:gap-5">
            <SearchBox
              dashboardSearchRef={dashboardSearchRef}
              runDashboardSearch={runDashboardSearch}
              placeholder={t('searchHint')}
            />

            {/* Keyboard shortcuts */}
            <div className="hidden xl:flex items-center gap-4" aria-label="Keyboard shortcuts">
              {[
                {
                  id: 'search',
                  label: 'Search',
                  keys: [primaryModifierLabel, 'K']
                },
                {
                  id: 'purchase',
                  label: 'Purchase',
                  keys: [primaryModifierLabel, 'SHIFT', 'P']
                },
                {
                  id: 'dispatch',
                  label: 'Dispatch',
                  keys: [primaryModifierLabel, 'SHIFT', 'D']
                },
              ].map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-1.5"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {group.label}
                  </span>
                  <div className="flex gap-0.5 items-center">
                    {group.keys.map((k, i) => (
                      <kbd
                        key={i}
                        className="min-w-[20px] h-5 flex items-center justify-center rounded border border-border border-b-2 bg-card px-1 font-sans text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-none"
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

        {/* Mobile / md bar */}
        <div className="lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link href="/stock" className="flex items-center gap-3 min-w-0" aria-label={t('dashboardAria')}>
              <BrandMark size={26} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold tracking-tight leading-tight text-slate-900 dark:text-slate-50">{language === 'hi' ? 'हनुमंत मार्बल' : 'Hanumant Marble'}</p>
              </div>
            </Link>

            <div className="flex items-center gap-0.5">
              {[
                { onClick: toggleLanguage, icon: <Languages className="h-4 w-4" />, badge: null, ariaLabel: 'Toggle language' },
                { onClick: () => setNotificationOpen(true), icon: <Bell className="h-4 w-4" />, badge: unreadCount > 0 ? unreadCount : null, ariaLabel: 'Notifications' },
                { onClick: () => setTheme(isDarkTheme ? 'light' : 'dark'), icon: isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />, badge: null, ariaLabel: isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode' },
                { onClick: handleStockLogout, icon: <LogOut className="h-4 w-4" />, badge: null, ariaLabel: 'Log out' },
              ].map((btn, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={btn.onClick}
                  aria-label={btn.ariaLabel}
                  title={btn.ariaLabel}
                  className="relative flex h-10 w-10 items-center justify-center rounded-md text-slate-500 transition-colors active:bg-muted hover:bg-muted dark:text-slate-400 focus-ring"
                >
                  {btn.icon}
                  {btn.badge != null && (
                    <span className="absolute right-1 top-1 inline-flex min-w-[16px] h-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-background">
                      {btn.badge > 99 ? '99+' : btn.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab-bar pattern: equal columns, icon over a short label, so every
              entry is named, nothing shifts between pages and the row never
              scrolls. */}
          <nav className="grid auto-cols-fr grid-flow-col gap-1 border-t border-border px-2 py-1" aria-label={t('mobileNav')}>
            {navigationItems.map((item) => {
              const active = isActiveRoute(item.href);
              return (
                <Link
                  key={`mobile-top-${item.href}`}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] leading-tight transition-colors focus-ring ${
                    active
                      ? 'font-semibold text-slate-900 dark:text-slate-50'
                      : 'font-medium text-slate-500 active:bg-muted dark:text-slate-400'
                  }`}
                >
                  {/* Saffron rule under the current page, same cue as the desktop rail. */}
                  {active && <span aria-hidden="true" className="absolute inset-x-4 -bottom-1 h-0.5 rounded-full bg-brand-primary" />}
                  <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-brand-primary' : ''}`} strokeWidth={active ? 2 : 1.75} />
                  {/* The label the layout already resolved. Deriving it from
                      href here instead meant any new nav entry silently fell
                      through to "Dashboard". */}
                  <span className="w-full truncate text-center">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
