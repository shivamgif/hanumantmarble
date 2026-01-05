"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import Link from 'next/link';
import { User, ShoppingBag, Heart, Settings, LogOut, Mail, Calendar, Shield, ChevronRight, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function ProfilePage() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium text-muted-foreground">Loading your profile...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    { icon: ShoppingBag, label: 'My Orders', href: '/orders', description: 'View your order history', color: 'from-blue-500 to-cyan-500' },
    { icon: Heart, label: 'Wishlist', href: '/wishlist', description: 'Items you\'ve saved', color: 'from-pink-500 to-rose-500' },
    { icon: Settings, label: 'Settings', href: '/profile', description: 'Account preferences', color: 'from-violet-500 to-purple-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header Section */}
        <div className="text-center mb-12">
          <Badge
            variant="outline"
            className="mb-4 px-4 py-2 bg-primary/10 backdrop-blur-md text-primary border-primary/20 hover:bg-primary/20 transition-all"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            My Account
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">Profile Settings</h1>
          <p className="text-muted-foreground max-w-md mx-auto">Manage your account settings and preferences</p>
        </div>

        <div className="max-w-4xl mx-auto grid gap-8">
          {/* Profile Card */}
          <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
            <CardContent className="p-8 relative">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Avatar Section */}
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                  {user?.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || 'Profile'}
                      className="relative h-28 w-28 rounded-full object-cover border-4 border-background shadow-xl"
                    />
                  ) : (
                    <div className="relative h-28 w-28 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center border-4 border-background shadow-xl">
                      <User className="h-12 w-12 text-white" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 bg-green-500 rounded-full border-4 border-background flex items-center justify-center">
                    <Shield className="h-3 w-3 text-white" />
                  </div>
                </div>

                {/* User Info */}
                <div className="text-center sm:text-left flex-1">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-1">{user?.name}</h2>
                  <p className="text-muted-foreground flex items-center justify-center sm:justify-start gap-2 mb-3">
                    <Mail className="h-4 w-4" />
                    {user?.email}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                      Verified Account
                    </Badge>
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                      Member
                    </Badge>
                  </div>
                </div>

                {/* Edit Profile Button */}
                <Button variant="outline" className="rounded-full" asChild>
                  <a href="/api/auth/logout" className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {menuItems.map((item, index) => (
              <Link key={item.href} href={item.href} className="group">
                <Card className={cn(
                  "h-full bg-card/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                )}>
                  <CardContent className="p-6 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className={cn(
                      "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300",
                      item.color
                    )}>
                      <item.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                      {item.label}
                      <ChevronRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Account Details Card */}
          <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Information
              </CardTitle>
              <CardDescription>Your personal account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium">{user?.name || 'Not provided'}</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                  <p className="text-sm text-muted-foreground">Email Address</p>
                  <p className="font-medium">{user?.email || 'Not provided'}</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                  <p className="text-sm text-muted-foreground">Account Status</p>
                  <p className="font-medium flex items-center gap-2">
                    <span className="h-2 w-2 bg-green-500 rounded-full" />
                    Active
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Member Since
                  </p>
                  <p className="font-medium">{user?.updated_at ? new Date(user.updated_at).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default withPageAuthRequired(ProfilePage, {
  onRedirecting: () => (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});
