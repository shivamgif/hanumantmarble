'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Camera, Coffee, LogIn, LogOut, MapPinOff, Play } from 'lucide-react';
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

/**
 * Shrink a camera photo to something worth sending. A modern phone hands back a
 * 4MB 12-megapixel JPEG; nobody identifying a face at a showroom door needs
 * more than 640px, and this keeps a punch to roughly a 60KB request instead of
 * a multi-megabyte one. Doing it here rather than on the server is the whole
 * point — no image processing in a serverless function, no cold-start cost on
 * the one endpoint that has to feel instant.
 *
 * toDataURL('image/jpeg') produces exactly the `data:image/jpeg;base64,...`
 * shape lib/attendance-selfie.mjs accepts. Browsers apply EXIF orientation on
 * draw, so a photo taken sideways lands the right way up.
 */
function shrinkToJpeg(file, maxEdge = 640, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That photo could not be read. Try again.'));
    };
    img.src = url;
  });
}

export function AttendanceClock({ onPunched }) {
  const [state, setState] = useState({ entry: null, elapsedMinutes: 0, onBreak: false, homeBranch: null, currentBranch: null });
  const [requireSelfie, setRequireSelfie] = useState(false);

  // The camera is opened by clicking a hidden file input, and the punch is sent
  // from its change handler. Awaiting a photo inside punch() would mean holding
  // a promise that never settles when someone backs out of the camera app —
  // this way, backing out simply leaves the button where it was.
  const fileRef = useRef(null);
  const pendingRef = useRef(null);
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
        if (cancelled) return;
        applyState(json);
        setRequireSelfie(Boolean(json.requireSelfie));
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

  // Clock in/out may need a photo first; breaks never do.
  function startPunch(action) {
    setError('');
    setFlash('');
    if (requireSelfie && (action === 'in' || action === 'out')) {
      pendingRef.current = action;
      // Reset the value so choosing the same file twice still fires `change`.
      if (fileRef.current) {
        fileRef.current.value = '';
        fileRef.current.click();
      }
      return;
    }
    punch(action);
  }

  async function onPhotoChosen(event) {
    const file = event.target.files?.[0];
    const action = pendingRef.current;
    pendingRef.current = null;
    if (!file || !action) return;

    setBusy(action);
    try {
      const selfie = await shrinkToJpeg(file);
      await punch(action, selfie);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  }

  async function punch(action, selfie = null) {
    setBusy(action);
    setError('');
    setFlash('');
    try {
      const coords = action === 'in' || action === 'out' ? await readPosition() : {};
      const res = await fetch('/api/stock/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...coords, ...(selfie ? { selfie } : {}) }),
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

  // The server rejects a punch with no home branch (403 branchRequired). Say so
  // up front and grey the button instead of letting someone tap it and read an
  // error — they cannot fix this themselves, only a manager can.
  const needsBranch = !loading && !state.homeBranch;

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
          {needsBranch ? (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-600 sm:justify-start">
              <Building2 className="h-3.5 w-3.5" />
              No branch assigned — ask a manager to set yours before clocking in
            </p>
          ) : null}
          {requireSelfie && !busy ? (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 sm:justify-start">
              <Camera className="h-3.5 w-3.5" />
              A photo is taken when you clock {isIn ? 'out' : 'in'}
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
                onClick={() => startPunch(onBreak ? 'break_end' : 'break_start')}
                disabled={Boolean(busy)}
                className={PILL_BUTTON_CLASS}
              >
                {onBreak ? <Play className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
                {onBreak ? 'End break' : 'Break'}
              </button>
              <button
                type="button"
                onClick={() => startPunch('out')}
                disabled={Boolean(busy) || needsBranch}
                className="flex shrink-0 items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-rose-600/20 transition-all hover:scale-105 hover:bg-rose-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {busy === 'out' ? 'Saving…' : 'Clock out'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => startPunch('in')}
              disabled={Boolean(busy) || loading || needsBranch}
              className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-8 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition-all hover:scale-105 hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {busy === 'in' ? 'Saving…' : 'Clock in'}
            </button>
          )}
        </div>
      </div>

      {/* capture="user" asks for the FRONT camera. It is a hint, not a
          guarantee — a desktop browser shows a file picker instead, which is
          why the server never trusts that a photo is a live selfie. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={onPhotoChosen}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {error ? <p className="mt-4 text-xs font-bold text-rose-500">{error}</p> : null}
      {flash ? <p className="mt-4 text-xs font-bold text-emerald-600">{flash}</p> : null}
    </div>
  );
}
