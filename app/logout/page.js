'use client';

import { authClient } from '@/lib/auth-client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function run() {
      const returnTo = (() => {
        try {
          const params = new URLSearchParams(window.location.search || '');
          return params.get('returnTo') || '/';
        } catch {
          return '/';
        }
      })();

      try {
        await authClient.signOut();
      } finally {
        if (active) {
          router.replace(returnTo);
        }
      }
    }

    run();

    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
