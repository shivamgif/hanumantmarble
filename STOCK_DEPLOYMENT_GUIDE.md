# Stock Management Subdomain - Deployment & Setup Guide

## ✅ Completed Setup (CLI)

- [x] Netlify site created: `hanumantmarble-stock`
- [x] Site linked to local project
- [x] Middleware for internal route protection
- [x] Database schema for inventory, movements, audit logs
- [x] API routes for stock items, movements, and audit logs
- [x] Stock management dashboard layout
- [x] netlify.toml configuration for deployment
- [x] Environment variable templates

## 📋 Step 1: Push Code to Git

Run these commands in your project folder:

```bash
# Check what changed
git status

# Add all new stock files
git add netlify.toml middleware.js .env.stock.example app/stock lib/audit-logger.js app/api/stock schema-stock.sql

# Commit
git commit -m "feat: Add internal stock management subdomain with auth, audit, and database schema"

# Push to GitHub
git push origin main
```

Netlify will auto-detect the push and start building. This may take 1-2 minutes.

---

## 🔧 Step 2: Set Up Neon PostgreSQL Database

### 2a. Create/Link Neon Project in Netlify

1. Go to **Netlify Dashboard** → select your **hanumantmarble-stock** site
2. Go to **Integrations** tab (or **Build & Deploy**)
3. Search for **"Neon"** → click **Enable**
4. Follow prompts to connect your Neon account (or create one)
5. Netlify will auto-add `DATABASE_URL` to environment variables
6. Verify in site **Build Settings** → **Environment**

### 2b. Initialize Stock Tables

Option 1: Using Netlify CLI (if you have psql local)
```bash
# Copy schema-stock.sql content and run via Neon console, OR
# Import schema via Netlify environment

# Verify connection
netlify env:list
```

Option 2: Using Neon Console (Recommended for beginners)
1. Go to [console.neon.tech](https://console.neon.tech)
2. Open your Neon project
3. Go to **SQL Editor**
4. Paste contents of `schema-stock.sql`
5. Click **Run**

Tables created:
- `stock_categories`
- `stock_items`
- `stock_locations`
- `stock_movements`
- `stock_audit_logs`

---

## 🔐 Step 3: Configure Auth0 for Stock Subdomain

### 3a. Add Callback URLs

1. Go to **Auth0 Dashboard** → **Applications** → your app
2. Go to **Settings** tab
3. Add these to **Allowed Callback URLs**:
   ```
   https://stock.yourdomain.com/auth/callback
   https://hanumantmarble-stock.netlify.app/auth/callback
   ```

4. Add these to **Allowed Logout URLs**:
   ```
   https://stock.yourdomain.com
   https://hanumantmarble-stock.netlify.app
   ```

5. Add these to **Allowed Web Origins**:
   ```
   https://stock.yourdomain.com
   https://hanumantmarble-stock.netlify.app
   ```

6. Click **Save**

### 3b. Create/Update Auth0 Rules (Optional but Recommended)

Go to Auth0 → **Rules** → Create new rule:

```javascript
function addRolesToAccessToken(user, context, callback) {
  if (user.email && ['admin@company.com', 'manager@company.com'].includes(user.email)) {
    context.idToken['https://stock/role'] = 'admin';
  }
  callback(null, user, context);
}
```

---

## 🌐 Step 4: Set Environment Variables in Netlify Dashboard

1. Go to **Netlify Dashboard** → **hanumantmarble-stock** site
2. Go to **Site settings** → **Build & deploy** → **Environment**
3. Add these variables (click **Edit variables**):

```
NEXT_PUBLIC_APP_TYPE=stock
NEXT_PUBLIC_REQUIRE_AUTH=true
NEXT_PUBLIC_INTERNAL_ONLY=true
NEXT_PUBLIC_URL=https://stock.yourdomain.com

AUTH0_SECRET=[your-32-byte-hex-secret]
AUTH0_DOMAIN=[your-auth0-domain]
AUTH0_CLIENT_ID=[your-auth0-client-id]
AUTH0_CLIENT_SECRET=[your-auth0-client-secret]
AUTH0_BASE_URL=https://stock.yourdomain.com
AUTH0_ISSUER_BASE_URL=https://[your-auth0-domain]

NEXT_PUBLIC_AUTH0_DOMAIN=[your-auth0-domain]
NEXT_PUBLIC_AUTH0_CLIENT_ID=[your-auth0-client-id]

ALLOWED_INTERNAL_EMAILS=your-email@company.com,manager@company.com

DATABASE_URL=[auto-added by Neon integration]
```

4. Click **Save**
5. Netlify will trigger a rebuild automatically

---

## 🔗 Step 5: Add Custom Domain & Set Up DNS

### 5a. Add Custom Domain in Netlify

1. Go to **Netlify Dashboard** → **hanumantmarble-stock** site
2. Go to **Site settings** → **Domain management**
3. Click **Add domain**
4. Enter: `stock.yourdomain.com`
5. Click **Continue**

### 5b. Add DNS Record at Your Domain Provider

You'll need to add a CNAME record. The exact steps depend on your provider:

**For Cloudflare:**
1. Go to cloudflare.com → your domain
2. Go to **DNS** tab
3. Click **+ Add record**
4. Type: CNAME
5. Name: `stock`
6. Target: `hanumantmarble-stock.netlify.app`
7. Proxy status: Orange cloud (Proxied) or Gray (DNS only)
8. Click **Save**

**For GoDaddy:**
1. Go to godaddy.com → My Domains
2. Click your domain → **Manage DNS**
3. Find or add CNAME record
4. Name: `stock`
5. Value: `hanumantmarble-stock.netlify.app`
6. TTL: Auto or 3600
7. Click **Save**

**For Namecheap:**
1. Go to namecheap.com → Dashboard
2. Click **Manage** next to your domain
3. Go to **Advanced DNS** tab
4. Add CNAME record:
   - Host: `stock`
   - Value: `hanumantmarble-stock.netlify.app`
   - TTL: 30 min or Auto
5. Click ✓

**For Route 53 (AWS):**
1. Go to AWS Route 53
2. Select your hosted zone
3. Create record:
   - Name: `stock.yourdomain.com`
   - Type: CNAME
   - Value: `hanumantmarble-stock.netlify.app`
4. Click **Create records**

⏳ **Wait 5-60 minutes for DNS propagation** (check status in Netlify dashboard)

---

## ✅ Step 6: Verify Everything Works

### 6a. Test the Subdomain

1. Open `https://stock.yourdomain.com`
2. You should be redirected to login
3. Log in with your Auth0 account
4. You should see the Stock Management Dashboard

### 6b. Test Internal-Only Access

1. Log out, then try accessing with a non-internal email (if you have one)
2. You should get "Access Denied"

### 6c. Test Database Connection

1. Go to `https://stock.yourdomain.com/stock/inventory`
2. Try adding a new item (you may see an empty list initially)
3. Check Neon console to verify data was written

---

## 📊 Step 7 (Optional): Add More Internal Users

Edit Netlify environment variable:

```
ALLOWED_INTERNAL_EMAILS=user1@company.com,user2@company.com,user3@company.com
```

Then Netlify will redeploy automatically.

---

## 🛡️ Security Best Practices

✅ Done:
- [x] Internal route protected by middleware
- [x] Auth0 required before any stock access
- [x] Audit logging of all actions
- [x] `noindex` header for stock subdomain
- [x] HTTPS auto-enabled by Netlify

Still Recommended:
- [ ] Enable Netlify Build Preview Restrictions (if possible)
- [ ] Add IP allowlist for office VPN only (contact Netlify support)
- [ ] Enable branch protection on main branch (GitHub → Settings → Branches)
- [ ] Set up Slack/Email alerts for deployment failures
- [ ] Regular backups of Neon database

---

## 🚑 Troubleshooting

### Site won't build
→ Check **Netlify Dashboard** → **Deploys** tab for error logs

### "DATABASE_URL not found"
→ Verify Neon integration is enabled, wait a few minutes, redeploy

### Auth0 login fails
→ Check Auth0 callback URLs match your domain exactly

### DNS not working
→ Use `nslookup stock.yourdomain.com` to verify CNAME record

### Audit logs not appearing
→ Ensure database schema was initialized (Step 2b)

---

## 📞 Support

- Netlify Docs: https://docs.netlify.com
- Auth0 Docs: https://auth0.com/docs
- Neon Docs: https://neon.tech/docs
