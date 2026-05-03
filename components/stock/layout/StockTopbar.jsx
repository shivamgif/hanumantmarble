'use client';

import Link from 'next/link';
import Image from 'next/image';
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
    color: 'text-slate-500',
    keywords: ['home', 'dashboard', 'main', 'overview'],
    href: '/stock',
  },
  {
    id: 'new-purchase',
    label: 'New Purchase',
    description: 'Log a new inbound shipment',
    icon: PlusCircle,
    color: 'text-emerald-600',
    keywords: ['new purchase', 'new arrival', 'np', 'purchase', 'buy', 'inbound', 'arrival'],
    href: '/stock?view=purchases&new=purchase',
  },
  {
    id: 'new-dispatch',
    label: 'New Dispatch',
    description: 'Create a new outbound dispatch',
    icon: Truck,
    color: 'text-amber-600',
    keywords: ['new dispatch', 'nd', 'dispatch', 'outbound', 'sell', 'send'],
    href: '/stock?view=dispatches&new=dispatch',
  },
  {
    id: 'purchases',
    label: 'Purchases',
    description: 'View all inbound shipments',
    icon: PackageCheck,
    color: 'text-emerald-600',
    keywords: ['purchases', 'arrivals', 'inbound', 'purchase list'],
    href: '/stock?view=purchases',
  },
  {
    id: 'dispatches',
    label: 'Dispatches',
    description: 'View all outbound dispatches',
    icon: Truck,
    color: 'text-amber-600',
    keywords: ['dispatches', 'outbound', 'dispatch list'],
    href: '/stock?view=dispatches',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Browse current stock levels',
    icon: Boxes,
    color: 'text-blue-600',
    keywords: ['inventory', 'items', 'stock', 'catalog', 'tiles'],
    href: '/stock?view=items',
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'View invoices and attached files',
    icon: FileText,
    color: 'text-violet-600',
    keywords: ['documents', 'files', 'invoices', 'docs'],
    href: '/stock/documents',
  },
  {
    id: 'approvals',
    label: 'Approvals',
    description: 'Review pending change requests',
    icon: Users,
    color: 'text-rose-600',
    keywords: ['approvals', 'change request', 'pending', 'review'],
    href: '/stock/admin?focus=change-requests',
  },
  {
    id: 'admin',
    label: 'Admin Hub',
    description: 'User management and settings',
    icon: Users,
    color: 'text-rose-600',
    keywords: ['admin', 'users', 'settings', 'management'],
    href: '/stock/admin',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Sales and stock analytics',
    icon: BarChart2,
    color: 'text-indigo-600',
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
      <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[320px] rounded-2xl border border-slate-200/60 bg-white/95 p-4 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/95">
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">No commands found for &ldquo;{query}&rdquo;</p>
      </div>
    );
  }

  return (
    <div
      className="absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[320px] overflow-hidden rounded-2xl border border-slate-200/60 bg-white/95 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/95"
      role="listbox"
      aria-label="Search suggestions"
    >
      {!query && (
        <div className="border-b border-slate-100 px-4 py-2 dark:border-white/5">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Quick Actions</p>
        </div>
      )}
      <ul className="max-h-72 overflow-y-auto py-1.5">
        {results.map((cmd, i) => {
          const Icon = cmd.icon;
          const isActive = i === activeIndex;
          return (
            <li key={cmd.id} role="option" aria-selected={isActive}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(cmd)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                  isActive
                    ? 'bg-brand-primary/5 dark:bg-brand-primary/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 ${cmd.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                    {cmd.label}
                  </span>
                  <span className="block truncate text-[10px] text-slate-400 dark:text-slate-500">
                    {cmd.description}
                  </span>
                </span>
                <ArrowRight className={`h-3 w-3 shrink-0 transition-opacity ${isActive ? 'text-brand-primary opacity-100' : 'opacity-0'}`} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-slate-100 px-4 py-2 dark:border-white/5">
        <p className="text-[9px] text-slate-400 dark:text-slate-500">
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[8px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">↑↓</kbd>
          {' '}navigate &nbsp;
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[8px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">↵</kbd>
          {' '}select &nbsp;
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[8px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">Esc</kbd>
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
      } else {
        runDashboardSearch(query);
        setQuery('');
        setOpen(false);
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
      <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400 group-focus-within:text-brand-primary transition-colors duration-300" />
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
        className="h-11 w-44 lg:w-56 xl:w-80 rounded-2xl border border-slate-100 bg-white pl-11 pr-9 text-sm font-bold text-slate-900 outline-none transition-all duration-300 focus:border-brand-primary/30 focus:ring-4 focus:ring-brand-primary/5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-brand-primary/30"
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
    <header className="sticky top-0 z-20 border-b border-slate-200/30 bg-white/60 backdrop-blur-2xl dark:border-white/5 dark:bg-slate-950/60">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Desktop bar */}
        <div className="hidden h-20 items-center justify-between gap-4 xl:gap-10 px-8 lg:flex">
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500 mb-1 truncate">{t('erpWorkspace')}</p>
            <p className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest truncate">{t('stockOpsApprovals')}</p>
          </div>

          <div className="flex flex-1 items-center justify-end gap-4 lg:gap-6">
            <SearchBox
              dashboardSearchRef={dashboardSearchRef}
              runDashboardSearch={runDashboardSearch}
              placeholder={t('searchHint')}
            />

            {/* Keyboard shortcuts */}
            <div className="hidden xl:flex items-center gap-3" aria-label="Keyboard shortcuts">
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

        {/* Mobile / md bar */}
        <div className="lg:hidden">
          <div className="flex h-16 items-center justify-between gap-4 px-6">
            <Link href="/stock" className="flex items-center gap-3 min-w-0" aria-label={t('dashboardAria')}>
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

          <nav className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100/50 px-4 py-3 dark:border-white/5 scrollbar-none" aria-label={t('mobileNav')}>
            {navigationItems.map((item) => {
              const active = isActiveRoute(item.href);
              let mobileLabel;
              if (item.href === '/stock/admin') mobileLabel = t('adminDashboard');
              else if (item.href === '/stock/analytics') mobileLabel = t('analytics');
              else mobileLabel = t('dashboard');

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
