'use client';

import { useEffect } from 'react';

const INTERACTIVE = 'button, a, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="reset"]';

export default function HapticProvider() {
  useEffect(() => {
    if (!navigator.vibrate) return;

    const handler = (e) => {
      if (e.target.closest(INTERACTIVE)) {
        navigator.vibrate(8);
      }
    };

    document.addEventListener('touchstart', handler, { passive: true });
    return () => document.removeEventListener('touchstart', handler);
  }, []);

  return null;
}
