'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, CalendarOff, ChevronRight, Clock, Settings, Users, Wallet } from 'lucide-react';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { getRoleFlags } from '@/lib/stock-roles.mjs';
import { AttendanceClock } from '../components/attendance-clock';
import { AttendanceTimesheet } from '../components/attendance-timesheet';
import { AttendanceLeave } from '../components/attendance-leave';
import { AttendancePayroll } from '../components/attendance-payroll';
import { AttendanceSettings } from '../components/attendance-settings';
import { AttendanceTeam } from '../components/attendance-team';
import { AttendanceEntrySheet } from '../components/attendance-entry-sheet';
import { AttendanceMonth } from '../components/attendance-month';
import { CLASSES, tabButtonClass } from '../lib/stock-utils';
import { useAttendanceText } from '@/lib/attendance-i18n';

// Plain pill buttons rather than a Tabs primitive — components/ui has no
// tabs.jsx, and the dashboard uses this same pattern at app/stock/page.js.
const TABS = [
  { id: 'me', labelKey: 'tabMe', needs: null, icon: Clock },
  { id: 'team', labelKey: 'tabTeam', needs: 'canViewAllAttendance', icon: Users },
  { id: 'timesheets', labelKey: 'tabTimesheets', needs: 'canViewAllAttendance', icon: CalendarDays },
  { id: 'leave', labelKey: 'tabLeave', needs: null, icon: CalendarOff },
  { id: 'payroll', labelKey: 'tabPayroll', needs: 'canViewAllAttendance', icon: Wallet },
  { id: 'settings', labelKey: 'tabSettings', needs: 'canManageAttendance', icon: Settings },
];

function AttendancePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthUser();
  const t = useAttendanceText();
  const { accessRole, accessLoading, accessUser } = useStockAccess(user);

  const flags = getRoleFlags(accessRole);
  const tabs = TABS.filter((tab) => !tab.needs || flags[tab.needs]);

  const requested = searchParams.get('view');
  const view = tabs.some((t) => t.id === requested) ? requested : 'me';

  const [employees, setEmployees] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  // The manager correction sheet: entry null = a new manual entry.
  const [editing, setEditing] = useState({ open: false, entry: null });
  const openEntry = flags.canManageAttendance ? (entry) => setEditing({ open: true, entry }) : undefined;

  const loadEmployees = useCallback(() => {
    if (!flags.canViewAllAttendance) return;
    fetch('/api/stock/attendance/employees', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { employees: [] }))
      .then((json) => setEmployees(json.employees || []))
      .catch(() => setEmployees([]));
  }, [flags.canViewAllAttendance]);

  useEffect(loadEmployees, [loadEmployees]);

  function setView(next) {
    router.replace(next === 'me' ? '/stock/attendance' : `/stock/attendance?view=${next}`, { scroll: false });
  }

  if (accessLoading) {
    return <p className="py-20 text-center text-xs font-bold text-slate-500">{t('loading')}</p>;
  }

  return (
    <div className={CLASSES.contentWrap}>
      <header>
        <div className="space-y-2">
          <nav className="flex items-center flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
            <Link href="/stock" className="hover:text-brand-primary transition-colors">{t('dashboard')}</Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-slate-900 dark:text-white">{t('title')}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            <span className="text-brand-primary">{t('title')}</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
            {t('subtitle')}
          </p>
        </div>
      </header>

      {tabs.length > 1 ? (
        // Same strip as the dashboard, analytics and admin tabs: below sm only the
        // active tab keeps its label, the rest collapse to icon circles. Six tabs
        // is one more than those strips carry, so this one may still scroll on the
        // narrowest phones rather than clip.
        <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted p-1 scrollbar-none sm:w-fit sm:gap-0">
          {tabs.map((tab) => {
            const isActive = view === tab.id;
            const Icon = tab.icon;
            const label = t(tab.labelKey);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                aria-label={label}
                aria-current={isActive ? 'true' : undefined}
                className={tabButtonClass(isActive)}
              >
                <Icon className="h-4 w-4 shrink-0 sm:hidden" />
                <span className={`overflow-hidden transition-all duration-300 ease-out sm:max-w-none sm:opacity-100 ${isActive ? 'max-w-[12rem] opacity-100' : 'max-w-0 opacity-0'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {view === 'me' ? (
        <>
          <AttendanceClock onPunched={() => setReloadKey((k) => k + 1)} />
          <AttendanceMonth reloadKey={reloadKey} />
          <AttendanceTimesheet scope="self" reloadKey={reloadKey} />
        </>
      ) : null}

      {view === 'team' ? <AttendanceTeam employees={employees} reloadKey={reloadKey} onEdit={openEntry} /> : null}

      {view === 'timesheets' ? (
        <AttendanceTimesheet
          scope="all"
          employees={employees}
          canManage={flags.canManageAttendance}
          reloadKey={reloadKey}
          onEdit={openEntry}
          onAdd={openEntry ? () => openEntry(null) : undefined}
        />
      ) : null}

      {view === 'leave' ? (
        <AttendanceLeave canManage={flags.canManageAttendance} employees={employees} currentUserId={accessUser?.id} />
      ) : null}

      {view === 'payroll' ? <AttendancePayroll /> : null}

      {view === 'settings' ? (
        <AttendanceSettings employees={employees} onEmployeesChanged={loadEmployees} />
      ) : null}

      {openEntry ? (
        <AttendanceEntrySheet
          open={editing.open}
          entry={editing.entry}
          employees={employees.filter((emp) => emp.tracksAttendance)}
          onClose={() => setEditing((e) => ({ ...e, open: false }))}
          onSaved={() => {
            setEditing((e) => ({ ...e, open: false }));
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </div>
  );
}

export default function AttendancePage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<p className="py-20 text-center text-xs font-bold text-slate-500">Loading…</p>}>
      <AttendancePageInner />
    </Suspense>
  );
}
