"use client"

import { useIdentity } from "@/contexts/IdentityContext";
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { user, login, logout } = useIdentity();

  return (
    <div>
      {user ? (
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground hidden md:inline">{user.email}</span>
          <Button onClick={logout} variant="outline">Logout</Button>
        </div>
      ) : (
        <Button onClick={login}>Login</Button>
      )}
    </div>
  );
}
