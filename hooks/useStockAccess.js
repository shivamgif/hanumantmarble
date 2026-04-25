'use client';

import { useEffect, useState } from 'react';

export function useStockAccess(user) {
  const [accessLoading, setAccessLoading] = useState(true);
  const [hasResolvedAccessOnce, setHasResolvedAccessOnce] = useState(false);
  const [accessApproved, setAccessApproved] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessRole, setAccessRole] = useState('stock_maintainer');
  const [accessUser, setAccessUser] = useState(null);

  // Use the user's stable ID string as the dependency, not the full object.
  // This prevents re-running the check when useAuthUser produces a new user
  // object reference for the same account (e.g. after a background refresh).
  // hasResolvedAccessOnce is intentionally NOT in the dep array — it was
  // previously causing a double-fetch: the effect ran, set it to true, which
  // re-triggered the effect and fetched /api/stock/access a second time.
  const userId = user?.id ?? null;

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      if (!userId) {
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
        setAccessUser(result.user || null);
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
  }, [userId]); // Only re-run when the actual user identity changes.

  return { accessLoading, hasResolvedAccessOnce, accessApproved, accessMessage, accessRole, accessUser };
}
