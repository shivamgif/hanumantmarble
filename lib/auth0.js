import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Provide explicit configuration and fallbacks to avoid missing/renamed envs in production
export const auth0 = new Auth0Client({
	// Prefer AUTH0_DOMAIN; fall back to legacy/placeholder vars if present
	domain:
		process.env.AUTH0_DOMAIN ||
		process.env.NEXT_PUBLIC_AUTH0_DOMAIN ||
		process.env.AUTH0_ISSUER_BASE_URL,
	clientId:
		process.env.AUTH0_CLIENT_ID ||
		process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
	clientSecret: process.env.AUTH0_CLIENT_SECRET,
	// Next.js v4 SDK expects APP_BASE_URL; map from other envs if needed
	appBaseUrl:
		process.env.APP_BASE_URL ||
		process.env.AUTH0_BASE_URL ||
		process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
		process.env.NEXT_PUBLIC_URL,
	secret: process.env.AUTH0_SECRET,
	// Auth0 v4 SDK uses /auth/* routes by default
});