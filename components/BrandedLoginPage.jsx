'use client';

import { authClient, getDefaultSocialProvider, getLogoutHref, useAuthUser } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, ArrowRight, LogIn, LogOut, Shield, Sparkles, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function BrandedLoginPage({ returnTo = '/', isInline = false }) {
  const { user, error, isLoading } = useAuthUser();
  const router = useRouter();
  const [signInError, setSignInError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authMode, setAuthMode] = useState('signin');
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
      await authClient.signIn.social({
        provider: socialProvider,
        callbackURL: returnTo || '/',
      });
    } catch (signInFailure) {
      const message = String(signInFailure?.message || '').toLowerCase();

      if (message.includes('provider not found')) {
        setSignInError(`Sign-in provider "${socialProvider}" is not configured on the server yet.`);
        return;
      }

      if (message.includes('too many requests') || message.includes('429') || message.includes('rate limit')) {
        const retryAt = Date.now() + 60_000;
        setSocialRetryAfter(retryAt);
        setSignInError('Too many sign-in attempts. Please wait 60 seconds and try again.');
        return;
      }

      if (message.includes('invalid origin') || message.includes('forbidden') || message.includes('403')) {
        setSignInError('This app origin is not trusted by Better Auth. Add the current localhost origin to trusted origins and restart the dev server.');
        return;
      }

      setSignInError('Unable to start sign-in. Please try again.');
    } finally {
      setIsSocialSubmitting(false);
    }
  }

  async function handleEmailPasswordAuth(event) {
    event.preventDefault();

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');
    const cleanName = String(name || '').trim();

    if (!cleanEmail || !cleanPassword) {
      setSignInError('Email and password are required.');
      return;
    }

    if (authMode === 'signup' && !cleanName) {
      setSignInError('Name is required for sign up.');
      return;
    }

    setSignInError('');
    setIsSubmitting(true);

    try {
      if (authMode === 'signup') {
        await authClient.signUp.email({
          email: cleanEmail,
          password: cleanPassword,
          name: cleanName,
        });
      }

      await authClient.signIn.email({
        email: cleanEmail,
        password: cleanPassword,
      });

      router.replace(returnTo || '/');
    } catch (authFailure) {
      const message = String(authFailure?.message || '').toLowerCase();

      if (message.includes('invalid') || message.includes('credentials')) {
        setSignInError('Invalid email or password. If this user was created before Better Auth migration, use "Create account" once with the same email/password to provision credentials.');
      } else if (message.includes('already exists') || message.includes('user_exists')) {
        setSignInError('This email is already registered. Try signing in instead.');
      } else {
        setSignInError('Unable to complete email/password authentication.');
      }
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-foreground">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
        </div>
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
          <div className="relative rounded-2xl border border-border bg-card/90 p-8 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-lg font-medium text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !isUnauthorizedError) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-foreground">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
        </div>
        <Card className="relative max-w-md border border-border bg-card/90 shadow-xl backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 mx-auto">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">Authentication Error</h2>
            <p className="mb-6 text-muted-foreground">{error.message}</p>
            <Button
              className="rounded-full"
              type="button"
              onClick={startSignIn}
              disabled={isSocialSubmitting || isSocialCooldownActive || !socialProvider}
            >
              {isSocialCooldownActive ? `Try again in ${socialCooldownSeconds}s` : 'Try Again'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4 text-foreground">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-10 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        <div className="grid max-w-lg gap-6 md:mx-auto">
          <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
            <div className="h-full p-3 sm:p-10 lg:p-12">
              <div className="mb-4 flex justify-center items-center gap-3">
                  <h1 className="text-3xl font-bold text-dark">Stock Portal</h1>
              </div>


               {user ? (
                    <div className="space-y-6">
                      <div className="rounded-3xl border border-border bg-muted/40 p-6 text-center">
                        <div className="relative mx-auto mb-4 h-24 w-24 overflow-hidden rounded-full border border-border bg-background">
                          {user.picture ? (
                            <img src={user.picture} alt={user.name || 'Profile'} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-primary/10">
                              <User className="h-10 w-10 text-primary" />
                            </div>
                          )}
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">You are already signed in</h3>
                        <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button className="flex-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" asChild>
                          <Link href={returnTo} className="flex items-center justify-center gap-2">
                            <ArrowRight className="h-4 w-4" />
                            Continue
                          </Link>
                        </Button>
                        <Button variant="outline" className="flex-1 rounded-full border-border hover:bg-muted/60" asChild>
                          <a href={getLogoutHref('/')} className="flex items-center justify-center gap-2">
                            <LogOut className="h-4 w-4" />
                            Log out
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      

                      

                      <div>
                        <form className="space-y-3" onSubmit={handleEmailPasswordAuth}>
                          {authMode === 'signup' ? (
                            <input
                              type="text"
                              value={name}
                              onChange={(event) => setName(event.target.value)}
                              placeholder="Full name"
                              className="w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
                              autoComplete="name"
                            />
                          ) : null}
                          <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Email"
                            className="w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
                            autoComplete="email"
                          />
                          <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Password"
                            className="w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
                            autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                          />
                          <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-10 w-full rounded-xl bg-primary text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                          >
                            {isSubmitting
                              ? 'Please wait...'
                              : (authMode === 'signin' ? 'Sign in with email' : 'Sign up with email')}
                          </Button>
                        </form>
                        <div className="m-3 flex justify-center items-center">
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:underline"
                            onClick={() => setAuthMode((current) => (current === 'signin' ? 'signup' : 'signin'))}
                          >
                            {authMode === 'signin' ? 'Create account' : 'Have an account? Sign in'}
                          </button>
                        </div>
                      </div>
                      <span className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <p className="h-px flex-1 bg-border" />
                        Or continue with
                        <p className="h-px flex-1 bg-border" />
                      </span>
                      {socialProvider ? (
                        <div className="flex items-center justify-center gap-2">
                        <Button
                          className="h-12 w-12 p-0 rounded-full text-center bg-transparent border border-primary text-base text-primary-foreground shadow-lg transition hover:bg-primary/90"
                          type="button"
                          onClick={startSignIn}
                          disabled={isSocialSubmitting || isSocialCooldownActive}
                        >
                          {isSocialCooldownActive ? `Try again in ${socialCooldownSeconds}s` : ''}
                          <Github className="h-6 text-primary" />
                        </Button>
                      </div>
                      ) : (
                        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Social sign-in is currently unavailable.
                        </div>
                      )}

                      {signInError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {signInError}
                        </div>
                      ) : null}

                      <p className="text-center text-xs text-muted-foreground">Use the same login for stock access and the rest of the site.</p>
                    </div>
                  )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}