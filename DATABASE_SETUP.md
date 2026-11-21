# Neon Database Setup for Netlify

This guide will help you set up the Neon PostgreSQL database for your application.

## 🚀 Setup Steps

### 1. Enable Neon on Netlify

1. Go to your [Netlify dashboard](https://app.netlify.com/)
2. Select your site
3. Go to **Integrations** tab
4. Search for "Neon" and click **Enable**
5. Follow the prompts to connect your Neon account
6. Netlify will automatically add `DATABASE_URL` to your environment variables

### 2. Initialize the Database

The schema lives in `db/migrations/*.sql`, applied in name order by `scripts/migrate.mjs`
and recorded in the `schema_migrations` table.

```bash
npm run db:migrate                 # fresh database: applies 0000_baseline.sql and everything after
npm run db:migrate -- --status     # list pending migrations, change nothing
```

A database that already had the schema before the runner existed (prod, branches of it)
was marked once with `--mark-applied 0000_baseline.sql`.

### 3. Verify the Setup

1. Visit your admin panel at `/admin`
2. Login with your Better Auth account (must be in `ADMIN_EMAILS`)
3. You should see all products listed
4. Try editing a product to test the database connection

## 📊 Database Schema

The `products` table includes:

- **Basic Info**: id, slug, name (EN/HI), category (EN/HI)
- **Content**: description (EN/HI), price, rating, reviews
- **Status**: in_stock
- **Details**: features (EN/HI), specifications, variants (all JSONB)
- **Media**: main_image
- **Timestamps**: created_at, updated_at

## 🔧 Local Development

For local development with database:

1. Create `.env.local` (copy from `.env.local.example`)
2. Get your Neon connection string from:
   - Netlify: Site Settings → Environment Variables
   - Or Neon Console: [console.neon.tech](https://console.neon.tech)
3. Add to `.env.local`:
   ```
   DATABASE_URL=postgres://user:password@host.neon.tech/database?sslmode=require
   ```
4. Run migrations: `npm run db:migrate`

## 🎯 Fallback Mechanism

The app automatically falls back to `data/products.json` when:
- `DATABASE_URL` is not configured
- Database connection fails
- Good for local development without database

## 🔐 Admin Access

Only emails listed in `lib/admin-config.js` can:
- Access `/admin` panel
- Create/edit/delete products
- See the admin button in navigation


## 🔀 Local and production are DIFFERENT databases

`.env.local` must point at a Neon **dev branch**, never at production. On 2026-11-20 it
was found pointing at the production endpoint, so "local" migrations and seed scripts had
been hitting live data.

To add a schema change: create the next numbered file in `db/migrations/` (e.g.
`0001_tenancy.sql`), run `npm run db:migrate` locally, then after review run it on
production from the main checkout:

```bash
npm run db:migrate:prod scripts/migrate.mjs -- --status   # what will run (needs .env.prod-owner.local)
npm run db:migrate:prod scripts/migrate.mjs               # run it
```

**Do not use `netlify dev:exec` for this.** It injects `.env.local` over the site's
settings, so the migration silently runs against the dev database. `db:migrate:prod`
resolves `netlify env:get DATABASE_URL --context production` explicitly.

Before any write, compare the endpoint ids. They must differ:

```bash
netlify env:get DATABASE_URL --context production | sed -E 's#.*@##; s#/.*##'
grep DATABASE_URL .env.local | sed -E 's#.*@##; s#/.*##'
```

Production is the `-pooler` host.

## 🏢 Multi-tenancy (row-level security)

Every business table has `tenant_id` and a policy that only shows rows of the
tenant in the transaction setting `app.tenant_id` (`db/migrations/0001_tenancy.sql`).

- **Two roles.** `DATABASE_URL` is the app login `app_rw` (RLS applies);
  `DATABASE_OWNER_URL` is the owner (migrations only, exempt from RLS). It is
  never set on Netlify: production migrations read it from the git-ignored
  `.env.prod-owner.local` on the machine that runs them
  (`npm run db:migrate:prod scripts/migrate.mjs`, `npm run check:rls:prod`).
  `app_rw` is created NOLOGIN by the migration; enable it once per database:
  `ALTER ROLE app_rw LOGIN PASSWORD '<random>';`
- **Every request** runs in one transaction scoped to the caller's tenant
  (`stockRoute` in `lib/stock-workflow.js` → `withTenant` in `lib/db.js`). It
  commits only when the response status is below 400. A query outside a request
  sees no rows.
- **A new table** in a migration needs, in the same file:
  ```sql
  tenant_id INT NOT NULL DEFAULT COALESCE(app_tenant(), 1) REFERENCES tenants(id),
  ALTER TABLE x ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON x USING (tenant_id = (SELECT app_tenant())) WITH CHECK (tenant_id = (SELECT app_tenant()));
  ```
  and any business-unique column is unique on `(tenant_id, column)`.
- **Check after every migration:** `npm run check:rls` (catalog, safe anywhere) and
  `npm run check:rls -- --data` (leak tests as app_rw, everything rolled back).

## 📝 Manual Database Operations

If you need to run custom SQL:

```javascript
import { sql } from './lib/db.js';

// Get all products
const products = await sql`SELECT * FROM products`;

// Add a new product
await sql`INSERT INTO products (...) VALUES (...)`;

// Update a product
await sql`UPDATE products SET price = ${newPrice} WHERE id = ${id}`;
```

## 🐛 Troubleshooting

### "DATABASE_URL is not defined"
- Check Netlify environment variables
- Verify `.env.local` for local development

### "Table already exists"
- Script is safe to re-run (uses `IF NOT EXISTS`)
- Products are upserted (updates on conflict)

### Products not showing in admin
- Check browser console for errors
- Verify admin email in `lib/admin-config.js`
- Ensure you're logged in with Better Auth

### Database connection errors
- Check if `DATABASE_URL` is correct
- Verify Neon project is active
- App will fall back to local JSON automatically

## 🌐 Environment Variables Needed

```bash
# Neon Database (auto-added by Netlify)
DATABASE_URL=postgres://...

# Better Auth (required for admin access)
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://your-site.netlify.app
NEXT_PUBLIC_BETTER_AUTH_URL=https://your-site.netlify.app
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Stripe (for checkout)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
