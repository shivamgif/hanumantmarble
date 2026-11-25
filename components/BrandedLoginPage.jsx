'use client';

import { authClient, getDefaultSocialProvider, getLogoutHref, useAuthUser } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, ArrowRight, LogOut, Shield, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CompanyMark } from '@/components/ui/brand-mark';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/product';
import { LoginIllustration } from '@/components/login-illustration';

// Setup details help a developer and confuse a customer: show them in dev only.
const devHint = (hint) => (process.env.NODE_ENV === 'production' ? '' : ` (dev: ${hint})`);

const FEATURES = ['Inventory, dispatch and showrooms', 'GST invoices, e-invoices and e-way bills', 'Books, attendance and insights'];

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
      setSignInError(`This sign-in option is not available. Use your email and password.${devHint('set NEXT_PUBLIC_BETTER_AUTH_SOCIAL_PROVIDER and provider credentials')}`);
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
          setSignInError(`This sign-in option is not available. Use your email and password.${devHint(`provider "${socialProvider}" is not configured on the server`)}`);
        } else if (message.includes('too many requests') || message.includes('429') || message.includes('rate limit')) {
          const retryAt = Date.now() + 60_000;
          setSocialRetryAfter(retryAt);
          setSignInError('Too many sign-in attempts. Please wait 60 seconds and try again.');
        } else if (message.includes('invalid origin') || message.includes('forbidden') || message.includes('403')) {
          setSignInError(`Sign-in is blocked from this address. Please contact support.${devHint('add this origin to Better Auth trusted origins and restart')}`);
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
          setSignInError('Incorrect email or password.');
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <div className="h-5 w-5 animate-spin rounded-full border border-border border-t-foreground" />
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
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-transparent">
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

  const inputClass = 'h-9 w-full rounded-lg border border-input bg-card px-4 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-primary/15';

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-muted p-10 lg:flex xl:p-14">
        <div className="flex items-center gap-2">
          <CompanyMark name={PRODUCT_NAME} size={36} priority />
          <span className="text-lg font-semibold tracking-tight">{PRODUCT_NAME}</span>
        </div>
        <div className="mx-auto w-full max-w-lg">
          <LoginIllustration className="w-full" />
          <h2 className="mt-8 text-2xl font-semibold tracking-tight xl:text-3xl">Every decision, from your own numbers.</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-foreground" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} {PRODUCT_NAME}</p>
      </aside>

      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <CompanyMark name={PRODUCT_NAME} size={44} priority className="mb-4 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{user ? PRODUCT_NAME : 'Sign in'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user ? PRODUCT_TAGLINE : `to ${PRODUCT_NAME}`}</p>
        </div>

        <section className="rounded-lg border border-border bg-card p-6 shadow-card sm:p-8">
          {user ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
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
            <div className="space-y-6">
              <form className="space-y-4" onSubmit={handleEmailPasswordAuth}>
                <div>
                  <label htmlFor="login-email" className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className={inputClass}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={inputClass}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" size="sm" disabled={isSubmitting} className="w-full text-[13px] font-semibold">
                  {isSubmitting ? 'Please wait…' : 'Sign in'}
                </Button>
              </form>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                <div className="rounded-lg border border-border bg-muted px-4 py-2 text-xs text-amber-800   dark:text-amber-300">
                  Social sign-in is currently unavailable.
                </div>
              )}

              {signInError ? (
                <div className="rounded-lg border border-border bg-muted px-4 py-2 text-xs text-red-700   dark:text-red-300" role="alert">
                  {signInError}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}
