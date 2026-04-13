'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LogIn, LogOut, Shield, Sparkles, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function BrandedLoginPage({ returnTo = '/' }) {
  const { user, error, isLoading } = useUser();
  const router = useRouter();
  const authLoginHref = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  const isUnauthorizedError = error?.message === 'Unauthorized' || error?.status === 401;

  useEffect(() => {
    if (user && returnTo) {
      router.replace(returnTo);
    }
  }, [user, returnTo, router]);

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
            <Button className="rounded-full" asChild>
              <a href={authLoginHref}>Try Again</a>
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
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
            <div className="h-full p-8 sm:p-10 lg:p-12">
              <div className="mb-6 flex items-center gap-3">
                <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-border bg-muted/40">
                  <img src="/logo.png" alt="Hanumant Marble logo" className="h-full w-full object-contain p-1.5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Hanumant Marble</p>
                  <h1 className="text-2xl font-bold text-foreground">Stock access portal</h1>
                </div>
              </div>

              <Badge variant="outline" className="mb-6 rounded-full border-primary/20 bg-primary/10 px-4 py-2 text-primary">
                <Sparkles className="mr-2 h-4 w-4" />
                {returnTo.startsWith('/stock') ? 'Stock access' : 'Sign in'}
              </Badge>

              <div className="max-w-xl space-y-4">
                <p className="text-4xl font-black tracking-tight sm:text-5xl">
                  Sign in to continue.
                </p>
                <p className="max-w-lg text-base leading-7 text-muted-foreground">
                  You’ll be redirected to Auth0 to authenticate, then returned here automatically.
                </p>
              </div>
            </div>
          </section>

          <section className="flex h-full items-stretch rounded-[2rem] border border-border bg-card shadow-xl">
            <Card className="w-full border-0 bg-transparent shadow-none">
              <CardContent className="flex h-full flex-col justify-between p-8 sm:p-10">
                <div>
                  <div className="mb-4 inline-flex rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {returnTo.startsWith('/stock') ? 'Stock login' : 'Website login'}
                  </div>

                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-foreground">Continue to your account</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Sign in securely through Auth0 and return to your requested page.
                    </p>
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
                          <a href="/auth/logout" className="flex items-center justify-center gap-2">
                            <LogOut className="h-4 w-4" />
                            Log out
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="rounded-3xl border border-border bg-muted/40 p-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <LogIn className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">Secure sign-in</p>
                            <p className="text-xs text-muted-foreground">Auth0 keeps credentials and authentication hosted.</p>
                          </div>
                        </div>
                      </div>

                      <Button className="h-12 w-full rounded-full bg-primary text-base text-primary-foreground shadow-lg transition hover:bg-primary/90" asChild>
                        <a href={authLoginHref} className="flex items-center justify-center gap-2">
                          Sign in
                          <ArrowRight className="h-5 w-5" />
                        </a>
                      </Button>

                      <p className="text-center text-xs text-muted-foreground">Use the same login for stock access and the rest of the site.</p>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-border pt-6 text-xs text-muted-foreground">
                  <span>Hanumant Marble</span>
                  <Link href={returnTo} className="font-medium text-primary hover:underline">
                    Return target: {returnTo}
                  </Link>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}