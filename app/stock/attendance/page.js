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
import { CLASSES } from '../lib/stock-utils';

// Plain pill buttons rather than a Tabs primitive — components/ui has no
// tabs.jsx, and the dashboard uses this same pattern at app/stock/page.js.
const TABS = [
  { id: 'me', label: 'My time', needs: null, icon: Clock },
  { id: 'team', label: 'Team', needs: 'canViewAllAttendance', icon: Users },
  { id: 'timesheets', label: 'Timesheets', needs: 'canViewAllAttendance', icon: CalendarDays },
  { id: 'leave', label: 'Leave', needs: null, icon: CalendarOff },
  { id: 'payroll', label: 'Payroll', needs: 'canViewAllAttendance', icon: Wallet },
  { id: 'settings', label: 'Settings', needs: 'canManageAttendance', icon: Settings },
];

function AttendancePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthUser();
  const { accessRole, accessLoading } = useStockAccess(user);

  const flags = getRoleFlags(accessRole);
  const tabs = TABS.filter((tab) => !tab.needs || flags[tab.needs]);

  const requested = searchParams.get('view');
  const view = tabs.some((t) => t.id === requested) ? requested : 'me';

  const [employees, setEmployees] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

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
    return <p className="py-20 text-center text-xs font-bold text-slate-400">Loading…</p>;
  }

  return (
    <div className={CLASSES.contentWrap}>
      <header>
        <div className="space-y-2">
          <nav className="flex items-center flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
            <Link href="/stock" className="hover:text-brand-primary transition-colors">Dashboard</Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="text-slate-900 dark:text-white">Attendance</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            <span className="text-brand-primary">Attendance</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
            Clock in, track hours, and run payroll.
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
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                aria-label={tab.label}
                aria-current={isActive ? 'true' : undefined}
                className={`flex h-10 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 ease-out sm:h-auto sm:w-auto sm:flex-none sm:rounded-lg sm:px-6 sm:py-2.5 ${isActive
                  ? 'flex-1 bg-white px-3 text-brand-primary shadow-sm dark:bg-slate-800'
                  : 'w-10 shrink-0 px-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
              >
                <Icon className="h-4 w-4 shrink-0 sm:hidden" />
                <span className={`overflow-hidden transition-all duration-300 ease-out sm:max-w-none sm:opacity-100 ${isActive ? 'max-w-[12rem] opacity-100' : 'max-w-0 opacity-0'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {view === 'me' ? (
        <>
          <AttendanceClock onPunched={() => setReloadKey((k) => k + 1)} />
          <AttendanceTimesheet scope="self" reloadKey={reloadKey} />
        </>
      ) : null}

      {view === 'team' ? <AttendanceTeam employees={employees} /> : null}

      {view === 'timesheets' ? (
        <AttendanceTimesheet
          scope="all"
          employees={employees}
          canManage={flags.canManageAttendance}
          reloadKey={reloadKey}
          onEdit={() => setReloadKey((k) => k + 1)}
        />
      ) : null}

      {view === 'leave' ? (
        <AttendanceLeave canManage={flags.canManageAttendance} employees={employees} />
      ) : null}

      {view === 'payroll' ? <AttendancePayroll /> : null}

      {view === 'settings' ? (
        <AttendanceSettings employees={employees} onEmployeesChanged={loadEmployees} />
      ) : null}
    </div>
  );
}

export default function AttendancePage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<p className="py-20 text-center text-xs font-bold text-slate-400">Loading…</p>}>
      <AttendancePageInner />
    </Suspense>
  );
}
