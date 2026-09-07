'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  { id: 'me', label: 'My time', needs: null },
  { id: 'team', label: 'Team', needs: 'canViewAllAttendance' },
  { id: 'timesheets', label: 'Timesheets', needs: 'canViewAllAttendance' },
  { id: 'leave', label: 'Leave', needs: null },
  { id: 'payroll', label: 'Payroll', needs: 'canViewAllAttendance' },
  { id: 'settings', label: 'Settings', needs: 'canManageAttendance' },
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
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Attendance</h1>
        <p className="mt-1 text-xs font-bold text-slate-500">Clock in, track hours, and run payroll.</p>
      </div>

      {tabs.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                view === tab.id
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'border border-border/60 text-slate-600 hover:bg-slate-500/5 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
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
