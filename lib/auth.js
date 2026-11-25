import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { dash } from '@better-auth/infra';
import { getAuthDatabase } from '@/lib/auth-db';
import { PRODUCT_NAME } from '@/lib/product';

function normalizeUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)
    ? value
    : `https://${value}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return '';
  }
}

function getTrustedOrigins() {
  const configuredOrigins = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_URL,
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  ]
    .map((value) => normalizeUrl(value))
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    configuredOrigins.push(
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    );
  }

  return Array.from(new Set(configuredOrigins));
}

function getSocialProviders() {
  const providers = {};

  const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const githubClientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
  const githubClientSecret = String(process.env.GITHUB_CLIENT_SECRET || '').trim();

  if (googleClientId && googleClientSecret) {
    providers.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    };
  }

  if (githubClientId && githubClientSecret) {
    providers.github = {
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    };
  }

  return providers;
}

function getDashPlugin() {
  return dash({
    // apiUrl: String(process.env.BETTER_AUTH_API_URL || '').trim() || undefined,
    // kvUrl: String(process.env.BETTER_AUTH_KV_URL || '').trim() || undefined,
    apiKey: String(process.env.BETTER_AUTH_API_KEY || '').trim() || undefined,
  });
}

const baseURL = normalizeUrl(process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL);

if (process.env.NODE_ENV === 'production') {
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required in production.');
  }

  if (!baseURL) {
    throw new Error('BETTER_AUTH_URL is required in production.');
  }
}

export const auth = betterAuth({
  appName: PRODUCT_NAME,
  secret: process.env.BETTER_AUTH_SECRET,
  database: getAuthDatabase() || undefined,
  baseURL: baseURL || undefined,
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  // A signed copy of the session in a cookie, so getSession on every API call
  // skips the database. Ceiling: a revoked or banned session keeps working for
  // up to maxAge. Stock access is still checked per request (stock_app_users).
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  trustedOrigins: getTrustedOrigins(),
  socialProviders: getSocialProviders(),
  plugins: [nextCookies(), getDashPlugin(), admin()],
  // No stock_app_users provisioning on signup: a company's manager adds staff by
  // email (Admin → Users), and the operator creates companies (scripts/create-tenant.mjs).
});
