import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Lazy initialization to avoid module-level evaluation during build
let _auth0 = null;

function getAuth0Client() {
	if (!_auth0) {
		_auth0 = new Auth0Client({
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
	}
	return _auth0;
}

// Export a proxy object that lazily initializes on first access
export const auth0 = new Proxy({}, {
	get(target, prop) {
		const client = getAuth0Client();
		const value = client[prop];
		if (typeof value === 'function') {
			return value.bind(client);
		}
		return value;
	}
});