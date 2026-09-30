'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Coffee, MapPinOff } from 'lucide-react';
import { formatMinutes, istToday } from '@/lib/attendance.mjs';
import { CLASSES } from '../lib/stock-utils';
import { clockTime } from './attendance-timesheet';

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

export function AttendanceTeam({ employees = [], reloadKey, onEdit }) {
  const [data, setData] = useState({ entries: [], onDuty: [], needsReview: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(istToday);

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
  }, [date, reloadKey]);

  const punchedIds = new Set(data.entries.map((e) => Number(e.user_id)));
  const tracked = employees.filter((emp) => emp.tracksAttendance);
  const missing = tracked.filter((emp) => !punchedIds.has(emp.id));
  const today = istToday();
  const review = data.needsReview || [];

  return (
    <div className="space-y-4">
      {/* Shifts nobody clocked out of. The system closed them at shift end so
          they cannot run into a 30-hour day; the real time is a manager's call. */}
      {review.length ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-xs font-black text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {review.length} forgotten clock-out{review.length === 1 ? '' : 's'} to review
          </h2>
          <p className="mt-1 text-[11px] font-bold text-amber-800/80 dark:text-amber-300/80">
            Closed automatically at shift end. Set the real clock-out time, or open and save to confirm.
          </p>
          <div className="mt-3 space-y-2">
            {review.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/70 p-3">
                <p className="text-xs font-bold">
                  <span className="font-black">{row.user_name}</span>
                  <span className="ml-2 tabular-nums text-slate-500">
                    {row.work_date} · {clockTime(row.clock_in_at)} → {clockTime(row.clock_out_at)} · {formatMinutes(row.workedMinutes)}
                  </span>
                </p>
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="rounded-full bg-amber-600 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white transition hover:bg-amber-700 active:scale-95"
                  >
                    Review
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
            max={istToday()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Attendance date"
            className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs font-bold outline-none focus:border-brand-primary/50"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(data.onDuty || []).map((row) =>
            // Open since an earlier day: they forgot to clock out. Their next
            // punch closes it at shift end; a manager can fix it now instead.
            row.work_date < today ? (
              <button
                key={row.id}
                type="button"
                onClick={() => onEdit?.(row)}
                disabled={!onEdit}
                className="flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1.5 text-[11px] font-black text-amber-800 transition enabled:hover:bg-amber-500/25 dark:text-amber-300"
              >
                <AlertTriangle className="h-3 w-3" />
                {row.user_name}
                <span className="tabular-nums opacity-80">
                  no clock-out since {row.work_date} {clockTime(row.clock_in_at)}
                </span>
              </button>
            ) : (
              <span
                key={row.id}
                className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[11px] font-black text-emerald-700 dark:text-emerald-400"
              >
                {row.user_name}
                <span className="tabular-nums opacity-70">since {clockTime(row.clock_in_at)}</span>
                {row.onBreak ? <Coffee className="h-3 w-3" aria-label="On break" /> : null}
              </span>
            )
          )}
          {!data.onDuty?.length ? <p className="text-xs font-bold text-slate-500">Nobody is clocked in.</p> : null}
        </div>
      </div>

      <div className={CLASSES.card}>
        <h2 className={CLASSES.title}>{date}</h2>
        {error ? <p className="mt-3 text-xs font-bold text-rose-500">{error}</p> : null}

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
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
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
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
                <p className="py-8 text-center text-xs font-bold text-slate-500">Nothing recorded for this day.</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
