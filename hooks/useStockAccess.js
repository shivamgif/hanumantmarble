'use client';

import { useEffect, useState } from 'react';

export function useStockAccess(user) {
  const [accessLoading, setAccessLoading] = useState(true);
  const [hasResolvedAccessOnce, setHasResolvedAccessOnce] = useState(false);
  const [accessApproved, setAccessApproved] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessRole, setAccessRole] = useState('stock_maintainer');

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      if (!user) {
        return;
      }

      if (!hasResolvedAccessOnce) {
        setAccessLoading(true);
      }
      
      try {
        const response = await fetch('/api/stock/access', { cache: 'no-store' });
        const result = await response.json();

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setAccessApproved(false);
          setAccessMessage(result.error || 'Access validation failed');
          setHasResolvedAccessOnce(true);
          return;
        }

        setAccessApproved(Boolean(result.approved));
        setAccessMessage(result.message || '');
        setAccessRole(result.role || 'stock_maintainer');
        setHasResolvedAccessOnce(true);
      } catch (accessError) {
        if (!mounted) {
          return;
        }

        setAccessApproved(false);
        setAccessMessage(accessError.message || 'Access connection error');
        setHasResolvedAccessOnce(true);
      } finally {
        if (mounted) {
          setAccessLoading(false);
        }
      }
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [hasResolvedAccessOnce, user]);

  return { accessLoading, hasResolvedAccessOnce, accessApproved, accessMessage, accessRole };
}
