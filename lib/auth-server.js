import { NextResponse } from 'next/server';
import { auth as betterAuth } from '@/lib/auth';
import { AUTH_PROVIDER_BETTER_AUTH, normalizeAuthProvider } from '@/lib/auth-config';

function normalizeSessionShape(session) {
  if (!session?.user) {
    return null;
  }

  const user = session.user;
  const provider = normalizeAuthProvider(user.auth_provider || AUTH_PROVIDER_BETTER_AUTH);
  const subject = String(user.sub || user.id || user.userId || '').trim();

  if (!subject) {
    return null;
  }

  return {
    ...session,
    user: {
      ...user,
      sub: subject,
      email: user.email || null,
      name: user.name || null,
      phone_number: user.phone_number || user.phone || null,
      picture: user.picture || user.image || null,
      auth_provider: provider,
      external_auth_provider: provider,
      external_auth_id: subject,
    },
  };
}

export async function getCurrentSession(request) {
  try {
    const session = await betterAuth.api.getSession({
      headers: request?.headers || new Headers(),
    });

    return normalizeSessionShape(session);
  } catch {
    return null;
  }
}

export async function requireSession(request) {
  const session = await getCurrentSession(request);

  if (!session?.user) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }

  return session;
}

export async function authMiddleware() {
  return NextResponse.next();
}

export function getAuthModeLabel() {
  return AUTH_PROVIDER_BETTER_AUTH;
}

export function normalizeIdentity(sessionUser) {
  if (!sessionUser) {
    return {
      provider: AUTH_PROVIDER_BETTER_AUTH,
      externalAuthId: null,
      email: '',
      name: '',
      phone: '',
      picture: '',
    };
  }

  const provider = normalizeAuthProvider(sessionUser.auth_provider || AUTH_PROVIDER_BETTER_AUTH);
  const externalAuthId = String(sessionUser.external_auth_id || sessionUser.sub || '').trim() || null;

  return {
    provider,
    externalAuthId,
    email: String(sessionUser.email || '').trim().toLowerCase(),
    name: String(sessionUser.name || '').trim(),
    phone: String(sessionUser.phone_number || sessionUser.phone || '').trim(),
    picture: String(sessionUser.picture || sessionUser.image || '').trim(),
  };
}

export const auth = {
  getSession: getCurrentSession,
  middleware: authMiddleware,
};
