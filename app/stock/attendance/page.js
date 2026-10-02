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
import { CLASSES, tabButtonClass, tabTrackClass } from '../lib/stock-utils';
import { useAttendanceText } from '@/lib/attendance-i18n';
import { Skeleton } from '@/components/ui/skeleton';

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
    return <AttendancePageSkeleton />;
  }

  return (
    <div className={CLASSES.contentWrap}>
      <header>
        <div className="space-y-2">
          <nav className="flex items-center flex-wrap gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Link href="/stock" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">{t('dashboard')}</Link>
            <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600" />
            <span className="text-slate-900 dark:text-white">{t('title')}</span>
          </nav>
          <h1 className="page-title">
            {t('title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
            {t('subtitle')}
          </p>
        </div>
      </header>

      {tabs.length > 1 ? (
        // Same strip as the dashboard, analytics and admin tabs: below sm, equal
        // columns with the icon over a label of up to two lines (see tabButtonClass).
        <div className={tabTrackClass(tabs.length)}>
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
                className={tabButtonClass(isActive, tabs.length)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="line-clamp-2 min-w-0 text-center sm:whitespace-nowrap">
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

// Same frame as the loaded page (crumb, title, tabs, punch card, month,
// timesheet), so nothing jumps when the real content lands.
function AttendancePageSkeleton() {
  return (
    <div className={CLASSES.contentWrap} aria-busy="true" aria-label="Loading attendance">
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-40 rounded-md" />
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-xl rounded-md" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg sm:w-[32rem]" />
      <div className={CLASSES.topCard}>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <Skeleton className="h-10 w-36 rounded-lg" />
            <Skeleton className="h-3.5 w-32 rounded-md" />
          </div>
          <Skeleton className="h-12 w-full rounded-full sm:w-44" />
        </div>
      </div>
      <Skeleton className="h-64" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    </div>
  );
}

export default function AttendancePage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<AttendancePageSkeleton />}>
      <AttendancePageInner />
    </Suspense>
  );
}
