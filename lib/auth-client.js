'use client';

import { createAuthClient } from 'better-auth/react';
import { useEffect, useMemo, useState } from 'react';

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
});

const DEFAULT_SOCIAL_PROVIDER =
  String(process.env.NEXT_PUBLIC_BETTER_AUTH_SOCIAL_PROVIDER || '').trim().toLowerCase();

export function getDefaultSocialProvider() {
  return DEFAULT_SOCIAL_PROVIDER;
}

export function AuthProvider({ children }) {
  return children;
}

export function useAuthUser() {
  const {
    data: session,
    error,
    isPending,
  } = authClient.useSession();

  const [timedOut, setTimedOut] = useState(false);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackSession, setFallbackSession] = useState(null);

  useEffect(() => {
    if (!isPending) {
      setTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTimedOut(true);
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isPending]);

  const errorMessage = String(error?.message || '').toLowerCase();
  const shouldUseFallbackSession = timedOut || errorMessage.includes('not found') || errorMessage.includes('404');

  useEffect(() => {
    let active = true;

    async function fetchFallbackSession() {
      if (!shouldUseFallbackSession) {
        setFallbackSession(null);
        setFallbackLoading(false);
        return;
      }

      setFallbackLoading(true);

      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Session fallback request failed (${response.status})`);
        }

        const json = await response.json();

        if (active) {
          setFallbackSession({ user: json?.user || null });
        }
      } catch {
        if (active) {
          setFallbackSession({ user: null });
        }
      } finally {
        if (active) {
          setFallbackLoading(false);
        }
      }
    }

    fetchFallbackSession();

    return () => {
      active = false;
    };
  }, [shouldUseFallbackSession]);

  const resolvedSession = session || fallbackSession;

  return {
    user: resolvedSession?.user || null,
    error: shouldUseFallbackSession ? null : (error || null),
    isLoading: Boolean((isPending && !timedOut) || fallbackLoading),
  };
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
