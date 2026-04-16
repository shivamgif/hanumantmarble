import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';

function getTrustedOrigins() {
  const configuredOrigins = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_URL,
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  ]
    .map((value) => String(value || '').trim())
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

const baseURL = String(process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL || '').trim();

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
  baseURL: baseURL || undefined,
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 8,
  },
  trustedOrigins: getTrustedOrigins(),
  socialProviders: getSocialProviders(),
  plugins: [nextCookies()],
});
