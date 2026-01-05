"use client";

import { useUser } from '@auth0/nextjs-auth0/client';
import Link from 'next/link';
import { LogIn, LogOut, ShoppingBag, User, ArrowRight, Sparkles, Mail, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const { user, error, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
        <Card className="max-w-md bg-card/80 backdrop-blur-sm border-0 shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Authentication Error</h2>
            <p className="text-muted-foreground mb-6">{error.message}</p>
            <Button className="rounded-full" asChild>
              <a href="/api/auth/login">Try Again</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex flex-col items-center justify-center relative overflow-hidden p-4">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-r from-primary/5 to-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Badge */}
        <div className="text-center mb-6">
          <Badge
            variant="outline"
            className="px-4 py-2 bg-primary/10 backdrop-blur-md text-primary border-primary/20"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {user ? 'Account' : 'Welcome'}
          </Badge>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
          <CardContent className="p-8 relative">
            {user ? (
              /* Logged In State */
              <div className="text-center">
                {/* Avatar */}
                <div className="relative mx-auto w-24 h-24 mb-6 group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/50 rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || 'Profile'}
                      className="relative h-full w-full rounded-full object-cover border-4 border-background shadow-xl"
                    />
                  ) : (
                    <div className="relative h-full w-full rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center border-4 border-background shadow-xl">
                      <User className="h-10 w-10 text-white" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 h-7 w-7 bg-green-500 rounded-full border-4 border-background flex items-center justify-center">
                    <Shield className="h-3 w-3 text-white" />
                  </div>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold mb-2">Welcome Back!</h1>
                <p className="text-muted-foreground mb-1">{user.name}</p>
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 mb-6">
                  <Mail className="h-3 w-3" />
                  {user.email}
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button className="flex-1 rounded-full" asChild>
                    <Link href="/orders" className="flex items-center justify-center gap-2">
                      <ShoppingBag className="h-4 w-4" />
                      My Orders
                    </Link>
                  </Button>
                  <Button variant="outline" className="flex-1 rounded-full hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50 transition-colors" asChild>
                    <a href="/api/auth/logout" className="flex items-center justify-center gap-2">
                      <LogOut className="h-4 w-4" />
                      Logout
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              /* Logged Out State */
              <div className="text-center">
                {/* Icon */}
                <div className="relative mx-auto w-20 h-20 mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/50 rounded-full blur-lg opacity-30" />
                  <div className="relative h-full w-full rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                    <User className="h-10 w-10 text-primary" />
                  </div>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold mb-3">Login to Your Account</h1>
                <p className="text-muted-foreground mb-8">
                  Sign in to access your orders, wishlist, and personalized experience.
                </p>

                <Button 
                  className="w-full rounded-full h-12 text-base bg-primary hover:bg-primary/90 shadow-lg hover:shadow-primary/25 transition-all duration-300" 
                  asChild
                >
                  <a href="/api/auth/login" className="flex items-center justify-center gap-2">
                    <LogIn className="h-5 w-5" />
                    Sign In
                    <ArrowRight className="h-5 w-5" />
                  </a>
                </Button>

                <p className="text-xs text-muted-foreground mt-6">
                  By signing in, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        {!user && (
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              New here?{' '}
              <a href="/api/auth/login" className="text-primary hover:underline font-medium">
                Create an account
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
