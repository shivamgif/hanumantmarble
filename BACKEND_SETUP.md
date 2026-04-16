# Backend Setup Guide (Better Auth Only)

## Required Environment Variables

```env
# App URLs
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_URL=http://localhost:3000

# Better Auth core
BETTER_AUTH_SECRET=replace-with-32-byte-random-secret
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Social providers (configure at least one)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# UI default social provider for login links
NEXT_PUBLIC_BETTER_AUTH_SOCIAL_PROVIDER=google

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Database
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

## Better Auth App Router Wiring

The app now uses the official Better Auth Next.js integration:

- Server instance: `lib/auth.js` exports `auth`
- API mount: `app/api/auth/[...path]/route.js` using `toNextJsHandler(auth)`
- Server session source of truth: `auth.api.getSession(...)`
- Session endpoint: `app/api/auth/session/route.js`
- Compatibility session endpoint: `app/api/auth/get-session/route.js`

## Login / Logout / Callback Paths

- Login: `/api/auth/sign-in/social?provider=<provider>&callbackURL=<path>`
- Logout: `/api/auth/sign-out?callbackURL=<path>`
- Callback: `/api/auth/callback/<provider>`
- Session: `/api/auth/session`

## Identity Mapping

Provider-neutral identity remains active:

- `external_auth_provider`
- `external_auth_id`

Legacy `auth0_sub` is kept as inert historical data and can be removed after retention requirements are met.

## Local / Staging / Production Runbook

1. Local
- Set `BETTER_AUTH_URL=http://localhost:3000`
- Set `NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000`
- Set `BETTER_AUTH_SECRET`
- Configure at least one provider client ID/secret
- Set callback URL in provider console: `http://localhost:3000/api/auth/callback/<provider>`

2. Staging
- Set `BETTER_AUTH_URL=https://staging.yourdomain.com`
- Rotate `BETTER_AUTH_SECRET` to staging-only value
- Register callback URL: `https://staging.yourdomain.com/api/auth/callback/<provider>`
- Verify `/api/auth/session` returns authenticated user after login

3. Production
- Set `BETTER_AUTH_URL=https://yourdomain.com`
- Rotate `BETTER_AUTH_SECRET` to production-only value (32+ bytes, high entropy)
- Register callback URL: `https://yourdomain.com/api/auth/callback/<provider>`
- Validate login/logout/session before traffic switch

## Validation Commands

```bash
npm run build

curl -i "http://localhost:3000/api/auth/sign-in/social?provider=google&callbackURL=/"
curl -i "http://localhost:3000/api/auth/sign-out?callbackURL=/"
curl -i "http://localhost:3000/api/auth/callback/google?code=test&state=test"
curl -i "http://localhost:3000/api/auth/session"
```

## Notes

- If callback returns provider-side errors, verify provider credentials and callback registration first.
- If session is null after login, verify `BETTER_AUTH_URL` and cookie domain/origin behavior.
