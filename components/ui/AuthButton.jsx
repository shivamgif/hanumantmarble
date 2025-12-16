"use client"

import { useUser } from '@auth0/nextjs-auth0/client';
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { user } = useUser();

  return (
    <div>
      {user ? (
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground hidden md:inline">{user.email}</span>
          <Button asChild>
            <a href="/api/auth/logout">Logout</a>
          </Button>
        </div>
      ) : (
        <Button asChild>
          <a href="/api/auth/login">Login</a>
        </Button>
      )}
    </div>
  );
}
