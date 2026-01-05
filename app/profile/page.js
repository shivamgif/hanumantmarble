"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import Link from 'next/link';

function ProfilePage() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="loading-state">
          <p className="loading-text">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold text-primary mb-8">Profile Settings</h1>
      
      <div className="max-w-2xl mx-auto bg-card p-8 rounded-lg shadow-md">
        <div className="flex items-center gap-6 mb-8">
          {user?.picture && (
            <img
              src={user.picture}
              alt={user.name || 'Profile'}
              className="h-24 w-24 rounded-full object-cover"
            />
          )}
          <div>
            <h2 className="text-2xl font-bold text-primary">{user?.name}</h2>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-primary mb-2">Account Information</h3>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Name: <span className="text-primary font-medium">{user?.name}</span></p>
              <p className="text-sm text-muted-foreground">Email: <span className="text-primary font-medium">{user?.email}</span></p>
            </div>
          </div>

          <div className="pt-6 border-t border-border">
            <Link href="/orders" className="button login">
              View My Orders
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default withPageAuthRequired(ProfilePage, {
  onRedirecting: () => (
    <div className="flex justify-center items-center h-screen">
      <div className="loading-state">
        <p className="loading-text">Redirecting to login...</p>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});
