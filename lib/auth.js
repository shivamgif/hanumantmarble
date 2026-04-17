import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { dash } from '@better-auth/infra';
import { getAuthDatabase } from '@/lib/auth-db';

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
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
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
    apiUrl: String(process.env.BETTER_AUTH_API_URL || '').trim() || undefined,
    kvUrl: String(process.env.BETTER_AUTH_KV_URL || '').trim() || undefined,
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
  appName: 'Hanumant Marble',
  secret: process.env.BETTER_AUTH_SECRET,
  database: getAuthDatabase() || undefined,
  baseURL: baseURL || undefined,
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 8,
  },
  trustedOrigins: getTrustedOrigins(),
  socialProviders: getSocialProviders(),
  plugins: [nextCookies(), getDashPlugin()],
});
