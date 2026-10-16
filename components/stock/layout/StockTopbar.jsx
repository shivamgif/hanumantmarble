'use client';

import { BrandMark } from '@/components/ui/brand-mark';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bell, Languages, MoonStar, SunMedium, LogOut, Search,
  PackageCheck, Truck, Boxes, FileText, Users, BarChart2,
  Home, PlusCircle, ArrowRight, X, Receipt, Clock, CalendarOff,
  CheckCheck, Loader2, Plus,
} from 'lucide-react';
import { getRoleFlags } from '@/lib/stock-roles.mjs';

// ─── Command catalogue ────────────────────────────────────────────────────────
// `show` hides a command the viewer's role cannot use; it mirrors the nav
// gating in app/stock/layout.js.
const isApprover = (flags, role) => role === 'admin' || role === 'manager';
const canWrite = (flags) => !flags.isReadOnly;
const canInvoice = (flags, role) => role !== 'read_only_admin';

const COMMANDS = [
  { id: 'dashboard', label: 'Dashboard', description: 'Go to stock dashboard', icon: Home,
    keywords: ['home', 'dashboard', 'main', 'overview'], href: '/stock' },
  { id: 'new-purchase', label: 'New Purchase', description: 'Log a new inbound shipment', icon: PlusCircle,
    keywords: ['new purchase', 'new arrival', 'np', 'purchase', 'buy', 'inbound', 'arrival'],
    href: '/stock?view=purchases&new=purchase', show: canWrite },
  { id: 'new-dispatch', label: 'New Dispatch', description: 'Create a new outbound dispatch', icon: Truck,
    keywords: ['new dispatch', 'nd', 'dispatch', 'outbound', 'sell', 'send'],
    href: '/stock?view=dispatches&new=dispatch', show: canWrite },
  { id: 'new-estimate', label: 'New Estimate', description: 'Raise a sales estimate', icon: Receipt,
    keywords: ['new estimate', 'ne', 'estimate', 'quote', 'quotation', 'bill'],
    href: '/stock/invoices?new=estimate', show: canInvoice },
  { id: 'dispatches', label: 'Dispatches', description: 'View all outbound dispatches', icon: Truck,
    keywords: ['dispatches', 'outbound', 'dispatch list'], href: '/stock?view=dispatches' },
  { id: 'purchases', label: 'Purchases', description: 'View all inbound shipments', icon: PackageCheck,
    keywords: ['purchases', 'arrivals', 'inbound', 'purchase list'], href: '/stock?view=purchases' },
  { id: 'inventory', label: 'Inventory', description: 'Browse current stock levels', icon: Boxes,
    keywords: ['inventory', 'items', 'stock', 'catalog', 'tiles'], href: '/stock?view=items' },
  { id: 'invoices', label: 'Invoices', description: 'Estimates, tax invoices and e-invoices', icon: FileText,
    keywords: ['invoices', 'estimates', 'gst', 'tax invoice', 'irn', 'e-invoice', 'eway'],
    href: '/stock/invoices', show: canInvoice },
  { id: 'attendance', label: 'Attendance', description: 'Punch in/out and timesheets', icon: Clock,
    keywords: ['attendance', 'punch', 'timesheet', 'payroll'], href: '/stock/attendance' },
  { id: 'leave', label: 'Leave', description: 'Apply for or review leave', icon: CalendarOff,
    keywords: ['leave', 'holiday', 'off'], href: '/stock/attendance?view=leave' },
  { id: 'documents', label: 'Documents', description: 'Attached files and bills', icon: FileText,
    keywords: ['documents', 'files', 'docs'], href: '/stock/documents' },
  { id: 'approvals', label: 'Approvals', description: 'Review pending change requests', icon: CheckCheck,
    keywords: ['approvals', 'change request', 'pending', 'review'],
    href: '/stock/admin?focus=change-requests', show: isApprover },
  { id: 'admin', label: 'Admin Hub', description: 'Users, locations and settings', icon: Users,
    keywords: ['admin', 'users', 'settings', 'management'], href: '/stock/admin', show: isApprover },
  { id: 'analytics', label: 'Analytics', description: 'Sales and stock analytics', icon: BarChart2,
    keywords: ['analytics', 'reports', 'charts', 'data', 'stats'], href: '/stock/analytics',
    show: (flags, role) => flags.canViewAllAnalytics || role === 'salesperson' },
];

const DEFAULT_COMMAND_IDS = ['new-dispatch', 'new-purchase', 'new-estimate', 'dispatches', 'purchases', 'inventory', 'invoices'];

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

const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Live record lookups. Each endpoint already scopes rows to the viewer (a
// salesperson sees their divisions / own invoices); a 403 just yields [].
async function searchRecords(q, { signal, withInvoices }) {
  const enc = encodeURIComponent(q);
  const get = (url, map) => fetch(url, { signal, cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : {}))
    .then(map)
    .catch(() => []);

  const groups = await Promise.all([
    get(`/api/stock/dispatches?search=${enc}&pageSize=5`, (json) => (json.dispatches || []).map((row) => ({
      id: `dispatch-${row.id}`,
      group: 'Dispatches',
      icon: Truck,
      label: row.shipment_number || `OUT-${row.id}`,
      description: [row.customer_name, row.truck_license_plate].filter(Boolean).join(' · '),
      href: `/stock?view=dispatches&entityType=outbound_shipment&entityId=${row.id}`,
    }))),
    get(`/api/stock/arrivals?search=${enc}&pageSize=5`, (json) => (json.arrivals || []).map((row) => ({
      id: `purchase-${row.id}`,
      group: 'Purchases',
      icon: PackageCheck,
      label: row.shipment_number || `INB-${row.id}`,
      description: [row.supplier_name, row.truck_license_plate].filter(Boolean).join(' · '),
      href: `/stock?view=purchases&entityType=inbound_shipment&entityId=${row.id}`,
    }))),
    withInvoices
      ? get(`/api/stock/sales-invoices?search=${enc}`, (json) => (json.invoices || []).map((row) => ({
        id: `invoice-${row.id}`,
        group: 'Invoices',
        icon: Receipt,
        label: row.invoice_number || `Estimate #${row.id}`,
        description: [row.bill_to_name, rupees(row.grand_total), row.status].filter(Boolean).join(' · '),
        href: `/stock/invoices/${row.id}`,
      })))
      : [],
  ]);
  return groups.flat();
}

// ─── SearchBox ────────────────────────────────────────────────────────────────
function SearchBox({ dashboardSearchRef, placeholder, accessRole, primaryModifierLabel }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [records, setRecords] = useState([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef(null);

  const flags = getRoleFlags(accessRole);
  const commands = COMMANDS.filter((c) => !c.show || c.show(flags, accessRole));
  const withInvoices = canInvoice(flags, accessRole);
  const trimmed = query.trim();

  const commandResults = trimmed
    ? commands.map((c) => ({ ...c, score: scoreCommand(c, trimmed) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
    : DEFAULT_COMMAND_IDS.map((id) => commands.find((c) => c.id === id)).filter(Boolean);
  const results = [...commandResults.map((c) => ({ ...c, group: trimmed ? 'Commands' : 'Quick actions' })), ...records];

  useEffect(() => {
    if (trimmed.length < 2) {
      setRecords([]);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchRecords(trimmed, { signal: controller.signal, withInvoices });
      if (controller.signal.aborted) return;
      setRecords(found);
      setSearching(false);
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed, withInvoices]);

  const close = useCallback(() => {
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
  }, []);

  const handleSelect = useCallback((item) => {
    router.push(item.href);
    close();
    dashboardSearchRef?.current?.blur();
  }, [router, close, dashboardSearchRef]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      close();
      dashboardSearchRef?.current?.blur();
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    }
  }, [open, results, activeIndex, close, dashboardSearchRef, handleSelect]);

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

  // Keep the highlight on the first row as results change under it.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, records]);

  return (
    <div ref={containerRef} className="relative flex w-full max-w-xl items-center group">
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
        className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-16 text-sm text-foreground placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-150 focus:border-slate-400 focus:ring-2 focus:ring-brand-primary/15 dark:focus:border-slate-500"
      />
      {query ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { setQuery(''); dashboardSearchRef?.current?.focus(); }}
          className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="pointer-events-none absolute right-2.5 flex gap-0.5" aria-hidden="true">
          <Kbd>{primaryModifierLabel.replace('+', '').trim()}</Kbd>
          <Kbd>K</Kbd>
        </span>
      )}
      {open && (
        <SearchDropdown
          query={trimmed}
          results={results}
          searching={searching}
          onSelect={handleSelect}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
        />
      )}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="min-w-[20px] h-5 flex items-center justify-center rounded border border-border border-b-2 bg-card px-1 font-sans text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-none">
      {children}
    </kbd>
  );
}

// ─── SearchDropdown ───────────────────────────────────────────────────────────
function SearchDropdown({ query, results, searching, onSelect, activeIndex, setActiveIndex }) {
  return (
    <div
      id="topbar-search-listbox"
      className="absolute left-0 top-[calc(100%+8px)] z-50 w-full min-w-[320px] glass overflow-hidden rounded-xl border animate-in fade-in-0 zoom-in-[0.98] slide-in-from-top-1 duration-150"
      role="listbox"
      aria-label="Search results"
    >
      <ul className="max-h-[26rem] overflow-y-auto p-1.5">
        {results.map((item, i) => {
          const Icon = item.icon;
          const isActive = i === activeIndex;
          const startsGroup = i === 0 || results[i - 1].group !== item.group;
          return (
            <li key={item.id} role="option" aria-selected={isActive}>
              {startsGroup && (
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">{item.group}</p>
              )}
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(item)}
                className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-100 ${
                  isActive ? 'bg-muted' : 'hover:bg-muted'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-slate-500 dark:text-slate-400">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.label}
                  </span>
                  {item.description && (
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {item.description}
                    </span>
                  )}
                </span>
                <ArrowRight className={`h-3 w-3 shrink-0 transition-opacity ${isActive ? 'text-brand-primary opacity-100' : 'opacity-0'}`} />
              </button>
            </li>
          );
        })}
        {searching && (
          <li className="flex items-center gap-2 px-2.5 py-2 text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching records…
          </li>
        )}
        {!searching && results.length === 0 && (
          <li className="px-2.5 py-3 text-center text-xs text-slate-400 dark:text-slate-500">
            Nothing found for &ldquo;{query}&rdquo;
          </li>
        )}
      </ul>
      <div className="border-t border-border px-3 py-2">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">↑↓</kbd>
          {' '}navigate &nbsp;
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">↵</kbd>
          {' '}open &nbsp;
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">Esc</kbd>
          {' '}close
          {query.length < 2 && <span className="ml-2">· type a shipment no., party, truck or invoice no.</span>}
        </p>
      </div>
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
  accessRole,
  primaryModifierLabel,
  navigationItems,
  isActiveRoute,
}) {
  const mod = primaryModifierLabel.replace('+', '').trim();
  const quickActions = getRoleFlags(accessRole).isReadOnly ? [] : [
    { label: 'Purchase', href: '/stock?view=purchases&new=purchase', keys: [mod, '⇧', 'P'] },
    { label: 'Dispatch', href: '/stock?view=dispatches&new=dispatch', keys: [mod, '⇧', 'D'] },
  ];

  return (
    <header className="glass-bar sticky top-0 z-20">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Desktop bar */}
        <div className="hidden h-14 items-center gap-4 px-8 lg:flex">
          <SearchBox
            dashboardSearchRef={dashboardSearchRef}
            placeholder={t('searchHint')}
            accessRole={accessRole}
            primaryModifierLabel={primaryModifierLabel}
          />

          <div className="ml-auto flex items-center gap-2">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-muted dark:text-slate-200 focus-ring"
              >
                <Plus className="h-4 w-4 text-brand-primary" />
                {action.label}
                <span className="hidden xl:flex gap-0.5" aria-hidden="true">
                  {action.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                </span>
              </Link>
            ))}
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
