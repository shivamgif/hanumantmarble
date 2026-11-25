'use client';

import { useContext, useEffect, useState } from 'react';
import { StockSessionContext } from '@/lib/auth-client';

// StockShell starts the access check as its code loads, alongside the session
// check, instead of after the session answers. The first checkAccess below
// picks that response up: one round-trip instead of two in a row.
let primed = null;
export function primeStockAccess() {
  if (typeof window !== 'undefined') primed ??= fetch('/api/stock/access', { cache: 'no-store' });
}

export function useStockAccess(user) {
  // Under StockShell: it already checked access, so reuse that (see StockSessionContext).
  const shared = useContext(StockSessionContext);
  const isShared = shared !== null;
  const [accessLoading, setAccessLoading] = useState(true);
  const [hasResolvedAccessOnce, setHasResolvedAccessOnce] = useState(false);
  const [accessApproved, setAccessApproved] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessRole, setAccessRole] = useState('stock_maintainer');
  const [accessUser, setAccessUser] = useState(null);
  // The company this session is working in, and every company it can switch to.
  const [accessTenant, setAccessTenant] = useState(null);
  const [accessTenants, setAccessTenants] = useState([]);

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
      if (!userId || isShared) {
        return;
      }

      if (!hasResolvedAccessOnce) {
        setAccessLoading(true);
      }
      
      try {
        const early = primed;
        primed = null;
        let response = early ? await early.catch(() => null) : null;
        // A 401 there predates an inline sign-in; ask again now that there's a user.
        if (!response || response.status === 401) {
          response = await fetch('/api/stock/access', { cache: 'no-store' });
        }
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
        setAccessTenant(result.tenant || null);
        setAccessTenants(Array.isArray(result.tenants) ? result.tenants : []);
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
  }, [userId, isShared]); // Only re-run when the actual user identity changes.

  if (isShared) return shared.access;
  return { accessLoading, hasResolvedAccessOnce, accessApproved, accessMessage, accessRole, accessUser, accessTenant, accessTenants };
}
