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

  // Lined up with the page below (contentWrap is p-4 sm:p-6, centred at
  // 1600px), as a card with an amber edge rather than a one-off grey banner.
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6 sm:pt-6">
      <div role="status" className="glass-panel flex items-center gap-3 rounded-lg border-l-4 border-l-amber-500 px-4 py-2.5">
        <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p className="flex-1 text-sm font-medium text-foreground">{t('clockInReminder')}</p>
        <Link
          href="/stock/attendance"
          className="inline-flex h-8 shrink-0 items-center rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          {t('clockInNow')}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('clockInLater')}
          className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
