'use client';

import { useEffect, useState } from 'react';
import { Coffee, MapPinOff } from 'lucide-react';
import { formatMinutes } from '@/lib/attendance.mjs';
import { CLASSES } from '../lib/stock-utils';
import { clockTime } from './attendance-timesheet';

const today = () => {
  // The business day in IST, which is what work_date holds — not the browser's
  // idea of today, which is a day off for anyone travelling.
  const ist = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;
};

/**
 * The clock-in / clock-out photos for one punch, when there are any.
 *
 * The <img> src is the authorised API route, not a public blob URL — the
 * browser sends the session cookie with it and the route re-checks the role, so
 * a screenshot of this page leaks a face but never a working link. Opening the
 * full size is a plain link to the same route; a lightbox would be more code
 * for something looked at once a month.
 */
function PunchSelfies({ row }) {
  const shots = [
    row.in_selfie_key ? { which: 'in', label: 'Clock-in photo' } : null,
    row.out_selfie_key ? { which: 'out', label: 'Clock-out photo' } : null,
  ].filter(Boolean);
  if (!shots.length) return null;

  return (
    <div className="flex shrink-0 -space-x-2">
      {shots.map((shot) => (
        <a
          key={shot.which}
          href={`/api/stock/attendance/selfie/${row.id}?which=${shot.which}`}
          target="_blank"
          rel="noopener noreferrer"
          title={shot.label}
        >
          <img
            src={`/api/stock/attendance/selfie/${row.id}?which=${shot.which}`}
            alt={`${shot.label} for ${row.user_name}`}
            loading="lazy"
            className="h-9 w-9 rounded-full border-2 border-background object-cover ring-1 ring-border/60"
          />
        </a>
      ))}
    </div>
  );
}

export function AttendanceTeam({ employees = [] }) {
  const [data, setData] = useState({ entries: [], onDuty: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(today);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/stock/attendance?userId=all&date=${date}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load team attendance');
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const punchedIds = new Set(data.entries.map((e) => Number(e.user_id)));
  const tracked = employees.filter((emp) => emp.tracksAttendance);
  const missing = tracked.filter((emp) => !punchedIds.has(emp.id));

  return (
    <div className="space-y-4">
      <div className={CLASSES.card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={CLASSES.title}>On duty now</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {data.onDuty?.length || 0} of {tracked.length} clocked in
            </p>
          </div>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Attendance date"
            className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs font-bold outline-none focus:border-brand-primary/50"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(data.onDuty || []).map((row) => (
            <span
              key={row.id}
              className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[11px] font-black text-emerald-700"
            >
              {row.user_name}
              <span className="tabular-nums opacity-70">since {clockTime(row.clock_in_at)}</span>
              {row.onBreak ? <Coffee className="h-3 w-3" aria-label="On break" /> : null}
            </span>
          ))}
          {!data.onDuty?.length ? <p className="text-xs font-bold text-slate-400">Nobody is clocked in.</p> : null}
        </div>
      </div>

      <div className={CLASSES.card}>
        <h2 className={CLASSES.title}>{date}</h2>
        {error ? <p className="mt-3 text-xs font-bold text-rose-500">{error}</p> : null}

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="py-8 text-center text-xs font-bold text-slate-400">Loading…</p>
          ) : (
            <>
              {data.entries.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
                >
                  <div className="flex items-center gap-3">
                    <PunchSelfies row={row} />
                    <div>
                    <p className="text-xs font-black">
                      {row.user_name}
                      {row.is_outside_geofence ? (
                        <MapPinOff className="ml-1.5 inline h-3 w-3 text-amber-500" aria-label="Outside geofence" />
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-500">
                      {clockTime(row.clock_in_at)} → {row.isOpen ? 'in now' : clockTime(row.clock_out_at)}
                      {row.isLate ? <span className="ml-1.5 text-rose-500">late {row.lateMinutes}m</span> : null}
                    </p>
                    </div>
                  </div>
                  <span className="text-xs font-black tabular-nums">{formatMinutes(row.workedMinutes)}</span>
                </div>
              ))}

              {missing.length ? (
                <div className="pt-2">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    No punch ({missing.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {missing.map((emp) => (
                      <span key={emp.id} className="rounded-full bg-slate-500/10 px-3 py-1.5 text-[11px] font-bold text-slate-500">
                        {emp.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {!data.entries.length && !missing.length ? (
                <p className="py-8 text-center text-xs font-bold text-slate-400">Nothing recorded for this day.</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
