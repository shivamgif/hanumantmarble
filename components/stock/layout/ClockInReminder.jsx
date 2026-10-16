'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { istToday } from '@/lib/attendance.mjs';

const DISMISS_KEY = 'hm-clockin-reminder-dismissed';

/**
 * Nudges a salesperson who has not punched yet today. Re-checks when the tab
 * comes back into view (a phone left on the app overnight never remounts the
 * layout) and when they leave the attendance page, so a fresh punch hides it.
 * "Later" silences it until tomorrow (IST).
 */
export default function ClockInReminder({ t, onAttendancePage }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (onAttendancePage) return undefined;
    let cancelled = false;

    const check = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        if (localStorage.getItem(DISMISS_KEY) === istToday()) return setShow(false);
      } catch {}
      fetch('/api/stock/attendance/punch', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!cancelled && json) setShow(json.tracksAttendance && !json.punchedToday);
        })
        .catch(() => {});
    };

    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', check);
    };
  }, [onAttendancePage]);

  if (!show || onAttendancePage) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, istToday());
    } catch {}
    setShow(false);
  }

  return (
    <div role="status" className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:mx-6 lg:mx-8">
      <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="flex-1 text-sm font-semibold text-amber-800 dark:text-amber-300">{t('clockInReminder')}</p>
      <Link
        href="/stock/attendance"
        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
      >
        {t('clockInNow')}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('clockInLater')}
        className="shrink-0 rounded-md p-1 text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-400"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
