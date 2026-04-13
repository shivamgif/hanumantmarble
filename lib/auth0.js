import { Auth0Client } from '@auth0/nextjs-auth0/server';

const appBaseUrl =
	process.env.APP_BASE_URL ||
	process.env.AUTH0_BASE_URL ||
	process.env.NEXT_PUBLIC_URL;

export const auth0 = new Auth0Client({
	appBaseUrl,
});