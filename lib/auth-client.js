'use client';

import { createAuthClient } from 'better-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function normalizeUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return undefined;
  }

  const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
  const withProtocol = isAbsolute
    ? value
    : `https://${value}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return undefined;
  }
}

function resolveAuthClientBaseURL() {
  const configured = normalizeUrl(process.env.NEXT_PUBLIC_BETTER_AUTH_URL);

  if (typeof window === 'undefined') {
    return configured;
  }

  const currentUrl = new URL(window.location.origin);

  if (!configured) {
    return currentUrl.origin;
  }

  try {
    const configuredUrl = new URL(configured);
    const localhostHosts = new Set(['localhost', '127.0.0.1', '::1']);
    const configuredIsLocal = localhostHosts.has(configuredUrl.hostname);
    const currentIsLocal = localhostHosts.has(currentUrl.hostname);

    // In local development, prefer the active browser origin so session calls
    // don't stick to a stale localhost port.
    if (configuredIsLocal && currentIsLocal && configuredUrl.port !== currentUrl.port) {
      return currentUrl.origin;
    }

    // In production, always prefer same-origin requests when the configured
    // auth host does not match the current host. This avoids cross-site cookie
    // issues that can surface as 401 on sign-in/session endpoints.
    if (!configuredIsLocal && configuredUrl.hostname !== currentUrl.hostname) {
      return currentUrl.origin;
    }

    return configuredUrl.origin;
  } catch {
    return currentUrl.origin;
  }
}

export const authClient = createAuthClient({
  baseURL: resolveAuthClientBaseURL(),
  sessionOptions: {
    // We manage our own background session validation below.
    // Disabling this stops better-auth's internal focus listener from clearing
    // the nanostores session atom and cascading unnecessary re-renders.
    refetchOnWindowFocus: false,
  },
});

const DEFAULT_SOCIAL_PROVIDER =
  String(process.env.NEXT_PUBLIC_BETTER_AUTH_SOCIAL_PROVIDER || '').trim().toLowerCase();

export function getDefaultSocialProvider() {
  return DEFAULT_SOCIAL_PROVIDER;
}

export function AuthProvider({ children }) {
  return children;
}

/**
 * useAuthUser
 *
 * Phase 1 — Initial load (runs once on mount):
 *   Fetches /api/auth/session directly. Sets user, error, isLoading.
 *   Does NOT use authClient.useSession() so there is no nanostores atom
 *   subscription that can be triggered by focus/online events.
 *
 * Phase 2 — Background validation (runs silently on visibilitychange):
 *   Re-checks the session when the tab becomes visible again.
 *   Compares the returned user ID against the currently stored ID via a ref.
 *   → Same user ID  : returns immediately, zero setState calls, zero re-renders.
 *   → Session gone  : sets user to null so the login screen appears correctly.
 *   → User changed  : updates state to the new user.
 *   Network errors during background checks are swallowed — they never
 *   disturb the currently displayed UI.
 */
export function useAuthUser() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stable ref to the current user ID. Read by the background checker without
  // creating a closure dependency, so it never needs to be in a dep array.
  const currentUserIdRef = useRef(null);

  // ── Phase 1: fetch session once on mount ────────────────────────────────
  useEffect(() => {
    let active = true;

    async function fetchSession() {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!active) return;

        if (!response.ok) {
          // 401 = not logged in, not an application error.
          if (response.status === 401) {
            setUser(null);
            setError(null);
            setIsLoading(false);
            currentUserIdRef.current = null;
            return;
          }
          throw new Error(`Session request failed (${response.status})`);
        }

        const json = await response.json();
        const fetchedUser = json?.user ?? null;

        setUser(fetchedUser);
        setError(null);
        setIsLoading(false);
        currentUserIdRef.current = fetchedUser?.id ?? null;
      } catch (err) {
        if (!active) return;
        setUser(null);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
        currentUserIdRef.current = null;
      }
    }

    fetchSession();
    return () => { active = false; };
  }, []); // Empty — runs once on mount only.

  // ── Phase 2: silent background validator on tab focus ───────────────────
  const silentSessionCheck = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401 && currentUserIdRef.current !== null) {
          // Was logged in, session is now gone → show login screen.
          setUser(null);
          setError(null);
          currentUserIdRef.current = null;
        }
        return;
      }

      const json = await response.json();
      const fetchedUserId = json?.user?.id ?? null;

      // Session still valid for the same user → do nothing, no re-render.
      if (fetchedUserId === currentUserIdRef.current) {
        return;
      }

      // A different account is now active — update state.
      const fetchedUser = json?.user ?? null;
      setUser(fetchedUser);
      currentUserIdRef.current = fetchedUserId;
    } catch {
      // Swallow network errors from background checks — never disrupt the UI.
    }
  }, []);

  useEffect(() => {
    // Guard against overlapping visibility checks.
    let checking = false;

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || checking) return;
      checking = true;
      silentSessionCheck().finally(() => { checking = false; });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [silentSessionCheck]); // silentSessionCheck is stable (useCallback([]))

  return { user, error, isLoading };
}

export function withPageAuthRequiredCompat(Component, options) {
  function BetterAuthGuard(props) {
    const { user, isLoading } = useAuthUser();
    const [redirecting, setRedirecting] = useState(false);

    const returnTo = useMemo(() => {
      if (options?.returnTo) {
        return options.returnTo;
      }
      if (typeof window === 'undefined') {
        return '/';
      }
      return `${window.location.pathname}${window.location.search}`;
    }, [options?.returnTo]);

    useEffect(() => {
      if (isLoading || user || redirecting) {
        return;
      }

      setRedirecting(true);
      window.location.assign(getLoginHref(returnTo));
    }, [isLoading, redirecting, returnTo, user]);

    if (isLoading || redirecting || !user) {
      if (typeof options?.onRedirecting === 'function') {
        return options.onRedirecting();
      }
      return null;
    }

    return <Component {...props} />;
  }

  BetterAuthGuard.displayName = `WithPageAuthRequiredCompat(${Component.displayName || Component.name || 'Component'})`;
  return BetterAuthGuard;
}

export function getLoginHref(returnTo = '/') {
  return `/login?returnTo=${encodeURIComponent(returnTo || '/')}`;
}

export function getLogoutHref(returnTo = '/') {
  return `/logout?returnTo=${encodeURIComponent(returnTo || '/')}`;
}
