export const AUTH_PROVIDER_BETTER_AUTH = 'better-auth';

export function getAuthProviderMode() {
  return AUTH_PROVIDER_BETTER_AUTH;
}

export function getPublicAuthProviderMode() {
  return AUTH_PROVIDER_BETTER_AUTH;
}

export function isAuth0Enabled(mode = getAuthProviderMode()) {
  return false;
}

export function isBetterAuthEnabled(mode = getAuthProviderMode()) {
  return mode === AUTH_PROVIDER_BETTER_AUTH;
}

export function normalizeAuthProvider(value) {
  const provider = String(value || '').trim().toLowerCase();

  if (provider === 'better-auth' || provider === 'better_auth' || provider === 'betterauth') {
    return AUTH_PROVIDER_BETTER_AUTH;
  }

  return AUTH_PROVIDER_BETTER_AUTH;
}
