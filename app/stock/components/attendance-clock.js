'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Coffee, LogIn, LogOut, MapPinOff, Play } from 'lucide-react';
import { formatMinutes } from '@/lib/attendance.mjs';
import { CLASSES, PILL_BUTTON_CLASS } from '../lib/stock-utils';

/**
 * Ask the browser for a fix, but never block the punch on it. GPS fails
 * indoors, in a basement, and whenever the employee declines the prompt — the
 * server records what it gets and flags the rest.
 */
function readPosition(timeoutMs = 8000) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({});
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const timer = setTimeout(() => done({}), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        done({});
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

export function AttendanceClock({ onPunched }) {
  const [state, setState] = useState({ entry: null, elapsedMinutes: 0, onBreak: false, homeBranch: null, currentBranch: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  // The elapsed counter ticks from a local reference rather than re-deriving
  // from the stored timestamp: the DB holds IST wall-clock, and re-parsing that
  // in whatever timezone the browser is in would drift by hours.
  const [ticks, setTicks] = useState(0);
  const baseRef = useRef({ minutes: 0, at: Date.now(), running: false });

  const applyState = useCallback((json) => {
    setState((prev) => ({
      entry: json.entry || null,
      elapsedMinutes: json.elapsedMinutes || 0,
      onBreak: Boolean(json.onBreak ?? json.entry?.break_started_at),
      // A punch response carries `location` (where it was just attributed); the
      // state response carries homeBranch/currentBranch. Keep whichever the
      // caller supplied and fall back to what we already knew, so a punch does
      // not blank out the branch line.
      homeBranch: json.homeBranch !== undefined ? json.homeBranch : prev.homeBranch,
      currentBranch:
        json.currentBranch !== undefined ? json.currentBranch : json.location !== undefined ? json.location : prev.currentBranch,
    }));
    baseRef.current = {
      minutes: json.elapsedMinutes || 0,
      at: Date.now(),
      running: Boolean(json.entry && !json.entry.clock_out_at && !(json.onBreak ?? json.entry?.break_started_at)),
    };
    setTicks(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stock/attendance/punch', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load punch state');
        return json;
      })
      .then((json) => {
        if (!cancelled) applyState(json);
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
  }, [applyState]);

  useEffect(() => {
    const id = setInterval(() => setTicks((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const base = baseRef.current;
  const liveMinutes = base.running
    ? base.minutes + Math.floor((Date.now() - base.at) / 60000)
    : base.minutes;
  void ticks; // re-render trigger for the counter above

  async function punch(action) {
    setBusy(action);
    setError('');
    setFlash('');
    try {
      const coords = action === 'in' || action === 'out' ? await readPosition() : {};
      const res = await fetch('/api/stock/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...coords }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Punch failed');

      applyState({ ...json, onBreak: Boolean(json.entry?.break_started_at) });
      setFlash(
        {
          in: 'Clocked in',
          out: 'Clocked out',
          break_start: 'Break started',
          break_end: 'Back from break',
        }[action]
      );
      onPunched?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const isIn = Boolean(state.entry && !state.entry.clock_out_at);
  const onBreak = state.onBreak;
  const branch = (isIn && state.currentBranch) || state.homeBranch || null;

  return (
    <div className={CLASSES.topCard}>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-600 dark:text-slate-400">
            {isIn ? (onBreak ? 'On break' : 'Clocked in') : 'Not clocked in'}
          </p>
          <p className="mt-1 text-4xl font-black tabular-nums text-slate-900 dark:text-white">
            {loading ? '—' : formatMinutes(liveMinutes)}
          </p>
          {/* While clocked in, show where the punch was actually attributed —
              someone covering another branch needs to see that, not their usual
              one. Otherwise show their home branch. Show nothing at all rather
              than inventing a default. */}
          {branch ? (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 sm:justify-start">
              <Building2 className="h-3.5 w-3.5" />
              {branch.name}
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {isIn && state.currentBranch ? 'punched here' : 'your branch'}
              </span>
            </p>
          ) : null}
          {state.entry?.is_outside_geofence ? (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-600 sm:justify-start">
              <MapPinOff className="h-3.5 w-3.5" />
              {branch ? `Punched away from ${branch.name}` : 'Punched away from your branch'}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {isIn ? (
            <>
              <button
                type="button"
                onClick={() => punch(onBreak ? 'break_end' : 'break_start')}
                disabled={Boolean(busy)}
                className={PILL_BUTTON_CLASS}
              >
                {onBreak ? <Play className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
                {onBreak ? 'End break' : 'Break'}
              </button>
              <button
                type="button"
                onClick={() => punch('out')}
                disabled={Boolean(busy)}
                className="flex shrink-0 items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-rose-600/20 transition-all hover:scale-105 hover:bg-rose-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {busy === 'out' ? 'Saving…' : 'Clock out'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => punch('in')}
              disabled={Boolean(busy) || loading}
              className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-8 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition-all hover:scale-105 hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {busy === 'in' ? 'Saving…' : 'Clock in'}
            </button>
          )}
        </div>
      </div>

      {error ? <p className="mt-4 text-xs font-bold text-rose-500">{error}</p> : null}
      {flash ? <p className="mt-4 text-xs font-bold text-emerald-600">{flash}</p> : null}
    </div>
  );
}
