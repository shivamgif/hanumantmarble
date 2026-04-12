'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Layout for internal stock management routes
 * Enforces authentication and internal-only access
 */
export default function StockLayout({ children }) {
  const { user, isLoading, error } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isLoading && !user) {
      router.push('/api/auth/login?returnTo=/stock');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Authentication Error</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Internal Header */}
      <header className="bg-white shadow border-l-4 border-red-600">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Stock Management System</h1>
              <p className="text-sm text-gray-500 mt-1">Internal Use Only</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Logged in as: <strong>{user?.email}</strong></p>
              <a href="/api/auth/logout" className="text-sm text-red-600 hover:text-red-700 mt-2 inline-block">
                Logout
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          <p>Internal Stock Management System • Last Updated: {new Date().toLocaleString()}</p>
        </div>
      </footer>
    </div>
  );
}
