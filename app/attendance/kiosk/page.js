'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Delete, LogIn, LogOut } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAttendanceText } from '@/lib/attendance-i18n';

/**
 * Shared showroom tablet. No session — the device is authorised by a paired
 * cookie and the employee by a PIN. Deliberately large touch targets and a
 * single screen: this is used standing up, in a hurry, by people who are not
 * looking for a menu.
 */
function KioskInner() {
  const searchParams = useSearchParams();
  const pairToken = searchParams.get('pair');
  const t = useAttendanceText();
  const { language, toggleLanguage } = useLanguage();

  const [device, setDevice] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState({ kind: '', message: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stock/attendance/kiosk', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'This device is not paired');
      setDevice(json.device);
      setEmployees(json.employees || []);
      setStatus({ kind: '', message: '' });
    } catch (err) {
      setDevice(null);
      setStatus({ kind: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  // Pair first if a token is in the URL, then load the roster either way.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (pairToken) {
        try {
          const res = await fetch('/api/stock/attendance/kiosk/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: pairToken }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Pairing failed');
          // Drop the token from the address bar so it does not linger in
          // history or on a screen anyone can photograph.
          window.history.replaceState({}, '', '/attendance/kiosk');
        } catch (err) {
          if (!cancelled) setStatus({ kind: 'error', message: err.message });
        }
      }
      if (!cancelled) await loadRoster();
    })();
    return () => {
      cancelled = true;
    };
  }, [pairToken, loadRoster]);

  // Clear the screen a few seconds after a punch so the next person starts fresh
  // and nobody's name is left on a public display.
  useEffect(() => {
    if (status.kind !== 'success') return undefined;
    const timer = setTimeout(() => {
      setSelected(null);
      setPin('');
      setSearch('');
      setStatus({ kind: '', message: '' });
      loadRoster();
    }, 5000);
    return () => clearTimeout(timer);
  }, [status, loadRoster]);

  async function submit(nextPin) {
    if (!selected || nextPin.length < 4) return;
    setBusy(true);
    try {
      const res = await fetch('/api/stock/attendance/kiosk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, pin: nextPin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Punch failed');
      setStatus({
        kind: 'success',
        action: json.action === 'in' ? 'in' : 'out',
        message: t(json.action === 'in' ? 'successIn' : 'successOut', { name: json.name }),
      });
      haptic('success');
    } catch (err) {
      setStatus({ kind: 'error', message: err.message });
      haptic('error');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  function press(digit) {
    if (busy) return;
    const next = `${pin}${digit}`.slice(0, 8);
    setPin(next);
    setStatus({ kind: '', message: '' });
  }

  // Home-branch staff are the default view; anyone else is reachable by search.
  // The server already sorts home-branch first.
  const homeStaff = employees.filter((e) => e.isHomeBranch);
  const visitors = employees.filter((e) => !e.isHomeBranch);
  const query = search.trim().toLowerCase();
  const shown = query
    ? employees.filter((e) => e.name.toLowerCase().includes(query))
    : homeStaff.length
      ? homeStaff
      : employees;

  if (loading) {
    return <p className="p-10 text-center text-sm font-bold text-slate-500">{t('loading')}</p>;
  }

  if (!device) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold">{t('notPaired')}</h1>
          <p className="mt-2 text-sm font-bold text-slate-500">
            {status.message || t('pairHint')}
          </p>
        </div>
      </div>
    );
  }

  // Success takes over the whole screen — readable from across the counter.
  if (status.kind === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-emerald-600 p-6 text-white">
        {status.action === 'in' ? <LogIn className="h-16 w-16" /> : <LogOut className="h-16 w-16" />}
        <p className="text-center text-3xl font-bold">{status.message}</p>
        <p className="text-sm font-bold opacity-80">{new Date().toLocaleTimeString('en-IN')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl p-5 sm:p-8">
      <header className="relative mb-6 text-center">
        <h1 className="text-lg font-bold tracking-tight">{device.label}</h1>
        <p className="text-xs font-medium text-slate-500">
          {device.locationName || t('kioskTitle')}
        </p>
        {/* A shared tablet never sees the stock sidebar's language switch. */}
        <button
          type="button"
          onClick={toggleLanguage}
          aria-label={language === 'hi' ? 'Switch to English' : 'हिंदी में बदलें'}
          className="absolute right-0 top-0 rounded-full border border-border/60 px-3 py-1.5 text-xs font-bold transition active:scale-[0.96]"
        >
          {language === 'hi' ? 'EN' : 'हिं'}
        </button>
      </header>

      {!selected ? (
        <>
          <p className="mb-3 text-center text-xs font-medium text-slate-500">
            {t('tapName')}
          </p>

          {/* Staff cover other branches, so everyone with a PIN can punch here.
              This branch's own people are shown up front; the search reaches
              the rest without turning the screen into a wall of names. */}
          {employees.length > 8 || visitors.length ? (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchName')}
              aria-label={t('searchName')}
              className="mb-4 w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-sm outline-none focus:border-brand-primary/50"
            />
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => {
                  setSelected(emp);
                  setPin('');
                  setStatus({ kind: '', message: '' });
                }}
                className={`rounded-xl border-2 p-5 text-sm font-bold transition active:scale-[0.96] ${
                  emp.isClockedIn
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                    : 'border-border/60 hover:border-brand-primary/50'
                }`}
              >
                {emp.name}
                <span className="mt-1 block text-xs font-medium opacity-70">
                  {emp.isClockedIn ? t('clockedIn') : t('clockedOut')}
                </span>
              </button>
            ))}
          </div>
          {!employees.length ? (
            <p className="py-10 text-center text-sm font-bold text-slate-500">{t('noPins')}</p>
          ) : !shown.length ? (
            <p className="py-10 text-center text-sm font-bold text-slate-500">{t('noMatch', { query: search })}</p>
          ) : !query && visitors.length ? (
            <p className="mt-4 text-center text-xs font-bold text-slate-500">{t('visiting')}</p>
          ) : null}
        </>
      ) : (
        <div className="mx-auto max-w-xs">
          <p className="text-center text-lg font-bold">{selected.name}</p>
          <p className="mb-4 text-center text-xs font-medium text-slate-500">
            {selected.isClockedIn ? t('enterPinOut') : t('enterPinIn')}
          </p>

          <div className="mb-5 flex justify-center gap-2" aria-live="polite">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <span
                key={i}
                className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-brand-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => press(digit)}
                className="rounded-xl border border-border/60 py-5 text-xl font-bold transition active:scale-[0.96] hover:bg-slate-500/5"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setPin('');
                setStatus({ kind: '', message: '' });
              }}
              className="rounded-lg border border-border/60 py-5 text-sm font-semibold transition active:scale-[0.96]"
            >
              {t('back')}
            </button>
            <button
              type="button"
              onClick={() => press(0)}
              className="rounded-xl border border-border/60 py-5 text-xl font-bold transition active:scale-[0.96] hover:bg-slate-500/5"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              aria-label={t('deleteDigit')}
              className="flex items-center justify-center rounded-xl border border-border/60 py-5 transition active:scale-[0.96]"
            >
              <Delete className="h-5 w-5" />
            </button>
          </div>

          {/* The only way to submit: PINs are 4-8 digits and the kiosk cannot
              know which length this employee has. */}
          {pin.length >= 4 ? (
            <button
              type="button"
              onClick={() => submit(pin)}
              disabled={busy}
              className="mt-3 w-full rounded-lg bg-primary py-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? t('checking') : t('confirm')}
            </button>
          ) : null}
        </div>
      )}

      {status.kind === 'error' ? (
        <p role="alert" className="mt-5 text-center text-sm font-bold text-rose-500">{status.message}</p>
      ) : null}
    </div>
  );
}

export default function KioskPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-sm font-bold text-slate-500">Loading…</p>}>
      <KioskInner />
    </Suspense>
  );
}
