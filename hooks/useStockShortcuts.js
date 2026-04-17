'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useStockShortcuts({ dashboardSearchRef }) {
  const router = useRouter();
  const [isApplePlatform, setIsApplePlatform] = useState(false);

  useEffect(() => {
    const platform = typeof navigator !== 'undefined' ? String(navigator.platform || '') : '';
    const userAgent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
    setIsApplePlatform(/mac|iphone|ipad|ipod/i.test(platform) || /mac os|iphone|ipad|ipod/i.test(userAgent));
  }, []);

  useEffect(() => {
    function handleGlobalShortcuts(event) {
      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dashboardSearchRef.current?.focus();
        dashboardSearchRef.current?.select();
        return;
      }

      if (isTypingTarget) {
        return;
      }

      const hasPrimaryModifier = isApplePlatform ? event.metaKey : event.ctrlKey;

      if (hasPrimaryModifier && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        router.push('/stock?view=purchases&new=purchase');
        return;
      }

      if (hasPrimaryModifier && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        router.push('/stock?view=dispatches&new=dispatch');
      }
    }

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [isApplePlatform, router, dashboardSearchRef]);

  return { isApplePlatform };
}
