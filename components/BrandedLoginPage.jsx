'use client';

import { authClient, getDefaultSocialProvider, getLogoutHref, useAuthUser } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, ArrowRight, LogOut, Shield, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/ui/brand-mark';

export default function BrandedLoginPage({ returnTo = '/', isInline = false }) {
  const { user, error, isLoading } = useAuthUser();
  const router = useRouter();
  const [signInError, setSignInError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSocialSubmitting, setIsSocialSubmitting] = useState(false);
  const [socialRetryAfter, setSocialRetryAfter] = useState(null);
  const socialProvider = getDefaultSocialProvider();
  const isUnauthorizedError = error?.message === 'Unauthorized' || error?.status === 401;

  const socialCooldownSeconds = socialRetryAfter
    ? Math.max(0, Math.ceil((socialRetryAfter - Date.now()) / 1000))
    : 0;

  const isSocialCooldownActive = socialCooldownSeconds > 0;

  async function startSignIn(event) {
    event?.preventDefault?.();

    setSignInError('');

    if (isSocialSubmitting || isSocialCooldownActive) {
      return;
    }

    if (!socialProvider) {
      setSignInError('Social sign-in is not configured in this environment. Use email/password or configure NEXT_PUBLIC_BETTER_AUTH_SOCIAL_PROVIDER and provider credentials.');
      return;
    }

    setIsSocialSubmitting(true);

    try {
      const { data, error } = await authClient.signIn.social({
        provider: socialProvider,
        callbackURL: returnTo || '/',
      });

      if (error) {
        const message = String(error.message || '').toLowerCase();

        if (message.includes('provider not found')) {
          setSignInError(`Sign-in provider "${socialProvider}" is not configured on the server yet.`);
        } else if (message.includes('too many requests') || message.includes('429') || message.includes('rate limit')) {
          const retryAt = Date.now() + 60_000;
          setSocialRetryAfter(retryAt);
          setSignInError('Too many sign-in attempts. Please wait 60 seconds and try again.');
        } else if (message.includes('invalid origin') || message.includes('forbidden') || message.includes('403')) {
          setSignInError('This app origin is not trusted by Better Auth. Add the current localhost origin to trusted origins and restart the dev server.');
        } else {
          setSignInError(error.message || 'Unable to start sign-in. Please try again.');
        }
        return;
      }
    } catch (signInFailure) {
      setSignInError('Unable to start sign-in. Please try again.');
    } finally {
      setIsSocialSubmitting(false);
    }
  }

  async function handleEmailPasswordAuth(event) {
    event.preventDefault();

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');

    if (!cleanEmail || !cleanPassword) {
      setSignInError('Email and password are required.');
      return;
    }

    setSignInError('');
    setIsSubmitting(true);

    try {
      const { data: signinData, error: signinError } = await authClient.signIn.email({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (signinError) {
        const message = String(signinError.message || '').toLowerCase();

        if (message.includes('invalid') || message.includes('credentials') || message.includes('not found')) {
          setSignInError('Invalid email or password. If this user was created before Better Auth migration, use "Create account" once with the same email/password to provision credentials.');
        } else if (message.includes('too many requests') || message.includes('429')) {
          setSignInError('Too many attempts. Please try again later.');
        } else {
          setSignInError(signinError.message || 'Unable to sign in. Please try again.');
        }
        return;
      }

      router.replace(returnTo || '/');
    } catch (authFailure) {
      setSignInError('An unexpected authentication error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (user && returnTo && !isInline) {
      if (typeof window !== 'undefined' && window.location.pathname !== returnTo) {
        router.replace(returnTo);
      }
    }
  }, [user, returnTo, router, isInline]);

  useEffect(() => {
    document.cookie = 'hm-login-return-to=; Path=/; Max-Age=0; SameSite=Lax';
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          Loading…
        </div>
      </div>
    );
  }

  if (error && !isUnauthorizedError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <Card className="max-w-md border border-border bg-card shadow-card">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-red-500/20 bg-red-500/[0.06]">
              <Shield className="h-5 w-5 text-red-600" strokeWidth={1.75} />
            </div>
            <h2 className="mb-2 text-lg font-semibold">Authentication error</h2>
            <p className="mb-6 text-sm text-muted-foreground">{error.message}</p>
            <Button
              type="button"
              onClick={startSignIn}
              disabled={isSocialSubmitting || isSocialCooldownActive || !socialProvider}
            >
              {isSocialCooldownActive ? `Try again in ${socialCooldownSeconds}s` : 'Try again'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const inputClass = 'w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-primary/15';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size={44} priority className="mb-4" />
          <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Hanumant Marble</p>
          <h1 className="mt-1 text-sm text-muted-foreground">Stock Portal</h1>
        </div>

        <section className="rounded-xl border border-border bg-card p-6 shadow-card sm:p-7">
          {user ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name || 'Profile'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <User className="h-5 w-5 text-slate-500" strokeWidth={1.75} />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">You are already signed in</h3>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" asChild>
                  <Link href={returnTo}>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <a href={getLogoutHref('/')}>
                    <LogOut className="h-4 w-4" />
                    Log out
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleEmailPasswordAuth}>
                <div>
                  <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@hanumantmarble.com"
                    className={inputClass}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={inputClass}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? 'Please wait…' : 'Sign in'}
                </Button>
              </form>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              {socialProvider ? (
                <Button
                  variant="outline"
                  className="w-full"
                  type="button"
                  onClick={startSignIn}
                  disabled={isSocialSubmitting || isSocialCooldownActive}
                >
                  <Github className="h-4 w-4" />
                  {isSocialCooldownActive ? `Try again in ${socialCooldownSeconds}s` : `Continue with ${socialProvider === 'github' ? 'GitHub' : socialProvider.charAt(0).toUpperCase() + socialProvider.slice(1)}`}
                </Button>
              ) : (
                <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  Social sign-in is currently unavailable.
                </div>
              )}

              {signInError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" role="alert">
                  {signInError}
                </div>
              ) : null}
            </div>
          )}
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">Use the same login for stock access and the rest of the site.</p>
      </div>
    </div>
  );
}
