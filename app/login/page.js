"use client";

import { useUser } from '@auth0/nextjs-auth0/client';
import Link from 'next/link';

export default function LoginPage() {
  const { user, error, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="loading-state">
          <p className="loading-text">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="error-state">
          <p className="text-red-500">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="main-card-wrapper w-full max-w-md">
        <h1 className="text-4xl font-bold text-primary mb-6">
          {user ? 'Welcome Back' : 'Login to Your Account'}
        </h1>
        <div className="action-card w-full">
          {user ? (
            <div className="logged-in-section text-center">
              <p className="logged-in-message">You are already logged in as</p>
              <p className="profile-email font-semibold">{user.email}</p>
              <div className="mt-6 flex flex-col sm:flex-row gap-4">
                <Link href="/orders" className="button login">
                  My Orders
                </Link>
                <a href="/auth/logout" className="button logout">
                  Logout
                </a>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="action-text mb-6">
                Click the button below to securely log in or create an account.
              </p>
              <a href="/auth/login" className="button login">
                Login
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
