'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { mergeLayout, toSaved } from '@/lib/layout-prefs.mjs';

/**
 * One saved arrangement (see lib/layout-prefs.mjs). `saved` is the user's
 * ui_prefs[key] from /api/stock/access; `defaults` must be a stable array.
 * Changes show at once and are saved to the account half a second later.
 */
export function useLayoutPref(key, defaults, saved) {
  // Edits made here, per key: the analytics page reuses this hook as the tab changes.
  const [local, setLocal] = useState({});
  const timers = useRef({});
  const mine = local[key];
  const items = useMemo(() => mergeLayout(defaults, mine ?? saved), [defaults, mine, saved]);

  const send = useCallback((value) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      // ponytail: a failed save only costs the arrangement, which is cosmetic; no retry.
      fetch('/api/stock/me/prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      }).catch(() => {});
    }, 500);
  }, [key]);

  const save = useCallback((next) => {
    const value = toSaved(next);
    setLocal((prev) => ({ ...prev, [key]: value }));
    send(value);
  }, [key, send]);

  const reset = useCallback(() => {
    setLocal((prev) => ({ ...prev, [key]: {} }));
    send(null);
  }, [key, send]);

  return { items, save, reset };
}
