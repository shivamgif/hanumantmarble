'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Camera, Coffee, LogIn, LogOut, MapPinOff, Play } from 'lucide-react';
import { formatMinutes } from '@/lib/attendance.mjs';
import { haptic } from '@/lib/haptics';
import { CLASSES, PILL_BUTTON_CLASS } from '../lib/stock-utils';

// Why a fix could not be read. These drive what the employee is TOLD to do,
// and the three cases need different advice: a denied permission needs browser
// settings, a timeout needs a window, an unsupported browser needs the kiosk.
const GEO = {
  denied: 'denied',
  timeout: 'timeout',
  unavailable: 'unavailable',
  unsupported: 'unsupported',
};

/**
 * Ask the browser for a fix, as { lat, lng } or { reason }.
 *
 * The reason used to be discarded — every failure collapsed to {} — which was
 * fine when a missing position was merely flagged. Now that an anchored branch
 * refuses the punch, "why" is the whole message: a browser that has been told
 * to block this site will NEVER prompt again, so telling someone to "allow
 * location access and try again" sends them round a loop with no prompt in it.
 */
function readPosition(timeoutMs = 2500) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ reason: GEO.unsupported });
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const timer = setTimeout(() => done({ reason: GEO.timeout }), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        clearTimeout(timer);
        done({
          reason:
            err?.code === err?.PERMISSION_DENIED
              ? GEO.denied
              : err?.code === err?.TIMEOUT
                ? GEO.timeout
                : GEO.unavailable,
        });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

/**
 * What to tell someone whose punch was refused for want of a position, and
 * whether a native prompt is still reachable.
 *
 * Only `denied` is unrecoverable from inside the page: once a site is blocked,
 * getCurrentPosition fails instantly and silently forever, so the only honest
 * instruction is where the browser hides the setting. Everything else is worth
 * simply retrying, which re-triggers the prompt when it has never been answered.
 */
function locationAdvice(reason) {
  if (reason === GEO.denied) {
    return {
      title: 'Location is blocked for this site',
      detail:
        'Your browser will not ask again until you change it: tap the padlock or ⓘ beside the web address, set Location to Allow, then try again.',
      canRetry: true,
    };
  }
  if (reason === GEO.unsupported) {
    return {
      title: 'This browser cannot share a location',
      detail: 'Punch from your phone, or use the kiosk tablet at your branch.',
      canRetry: false,
    };
  }
  return {
    title: 'Could not get your location',
    detail:
      'The signal may be weak indoors. Step near a window or door, make sure location is switched on for your device, and try again.',
    canRetry: true,
  };
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

  // Why location is standing in the way, or '' when it is not. Set either up
  // front from the Permissions API or after a punch the server refused.
  const [geoReason, setGeoReason] = useState('');

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

  // Warn BEFORE the tap when the browser has this site blocked. Waiting for a
  // failed punch to say so is a worse trade than it looks: getCurrentPosition
  // returns instantly in that state, so the employee just sees a punch bounce
  // with no prompt and no clue why.
  //
  // onchange clears the warning the moment they flip the setting, without a
  // reload — the Permissions API is the only way to notice that, since a denied
  // site is never asked again. Wrapped because Firefox has historically thrown
  // on a geolocation query rather than resolving.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return undefined;

    let status = null;
    const sync = () => setGeoReason((prev) => (status.state === 'denied' ? GEO.denied : prev === GEO.denied ? '' : prev));

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        status = result;
        sync();
        status.addEventListener('change', sync);
      })
      .catch(() => {});

    return () => status?.removeEventListener('change', sync);
  }, []);

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
      const fix = action === 'in' || action === 'out' ? await readPosition() : {};
      const res = await fetch('/api/stock/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the coordinates cross the wire; `reason` is for this screen.
        body: JSON.stringify({ action, lat: fix.lat, lng: fix.lng, ...(selfie ? { selfie } : {}) }),
      });
      const json = await res.json();

      if (!res.ok) {
        // The server decides whether this branch can be geofenced at all, so it
        // owns the verdict; the browser owns the reason. Together they make an
        // instruction the employee can actually act on.
        if (json.locationRequired) {
          setGeoReason(fix.reason || GEO.unavailable);
          haptic('error');
          return;
        }
        throw new Error(json.error || 'Punch failed');
      }
      setGeoReason('');

      applyState({ ...json, onBreak: Boolean(json.entry?.break_started_at) });
      haptic('success');
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
      haptic('error');
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
  const advice = geoReason ? locationAdvice(geoReason) : null;

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

      {/* The punch was refused for want of a position, or the browser has this
          site blocked outright. Either way this is the only place the employee
          finds out what to actually do about it. */}
      {advice ? (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-black text-amber-700 dark:text-amber-400">
            <MapPinOff className="h-3.5 w-3.5 shrink-0" />
            {advice.title}
          </p>
          <p className="mt-1 text-[11px] font-bold leading-relaxed text-amber-700/80 dark:text-amber-400/80">
            {advice.detail}
          </p>
          {advice.canRetry ? (
            <button
              type="button"
              onClick={() => startPunch(isIn ? 'out' : 'in')}
              disabled={Boolean(busy) || needsBranch}
              className="mt-2.5 rounded-full bg-amber-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Try again'}
            </button>
          ) : null}
        </div>
      ) : null}

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

      <p role="alert" className="mt-4 text-xs font-bold text-rose-500 empty:hidden">{error}</p>
      <p role="status" aria-live="polite" className="mt-4 text-xs font-bold text-emerald-600 empty:hidden">{flash}</p>
    </div>
  );
}
