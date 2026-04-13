# 🎯 Quick Start Guide - Stock System Testing

## 📝 Test Credentials

### Admin Account
```
Email: admin@stock.com
Phone: 9111111111
Password: [Use Auth0]
Access: FULL - User management, approvals, all dashboards
```

### Manager Account
```
Email: manager1@stock.com
Phone: 9222222221
Password: [Use Auth0]
Access: APPROVALS - Can approve/reject shipments, help with users
```

### Stock Maintainer Account
```
Email: maintainer1@stock.com
Phone: 9333333331
Password: [Use Auth0]
Access: LIMITED - Log arrivals, upload documents only
```

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open browser
open http://localhost:3000

# 4. Navigate to stock dashboard
# Open http://localhost:3000/stock/approvals
```

---

## 🧪 Test Scenarios

### Scenario 1: Admin Full Access
1. Login as `admin@stock.com`
2. Navigate to `/stock/team`
   - ✅ Should see "Users & Contacts" link
   - ✅ Can create/edit/delete users
3. View `/stock/approvals`
   - ✅ See all inbound shipments
   - ✅ Approval buttons visible
   - ✅ Can approve/reject INBOUND-001 through INBOUND-006
4. View change requests
   - ✅ Should see CR-2026-001 through CR-2026-005
   - ✅ Can approve/reject changes

### Scenario 2: Manager Approvals
1. Login as `manager1@stock.com`
2. Navigate to `/stock/team`
   - ✅ Should see user management link
   - ⚠️  Limited functionality compared to admin
3. View `/stock/approvals`
   - ✅ See shipment queue
   - ✅ Approval buttons visible
   - ✅ Can approve pending shipments

### Scenario 3: Maintainer Restrictions (ENFORCED)
1. Login as `maintainer1@stock.com`
2. Navigate to `/stock/approvals`
   - ✅ Can see shipment list (read-only)
   - ❌ NO approval buttons visible
   - ✅ Can upload dispatch documents
3. Try to access `/stock/team`
   - ❌ Link not shown in navigation
   - ❌ If URL accessed directly, denied or redirected
4. Backend API tests (use browser DevTools)
   - TRY: POST to `/api/stock/users`
     - ❌ Response: 403 Forbidden
   - TRY: PATCH `/api/stock/inbound-shipments/[id]` with approve action
     - ❌ Response: 403 Forbidden
   - TRY: POST `/api/stock/inbound-shipments` (create new arrival)
     - ✅ Response: 200/201 (success)

---

## 📊 Sample Data Available

### Inbound Shipments (6 total)
- INBOUND-001: ✅ **APPROVED** (5 days old)
- INBOUND-002: ⏳ **PENDING** (today)
- INBOUND-003: 🔄 **CHANGES_REQUESTED** (3 days old)
- INBOUND-004: ❌ **REJECTED** (2 days old)
- INBOUND-005: ✅ **APPROVED** (1 day old)
- INBOUND-006: 🔍 **REVIEWED** (mid-month)

### Outbound Shipments (5 total)
- OUTBOUND-001: ✅ **DISPATCHED** (3 days old)
- OUTBOUND-002: ✅ **APPROVED** (ready)
- OUTBOUND-003: ⏳ **PENDING** (today)
- OUTBOUND-004: ✅ **DISPATCHED** (5 days old)
- OUTBOUND-005: 🔄 **CHANGES_REQUESTED** (awaiting clarifications)

### Products (8 SKUs)
- KAJ-600-WHT (Kajaria White 600x600)
- KAJ-800-BLK (Kajaria Black 800x800)
- SOM-600-GRY (Somany Grey 600x600)
- BRL-MBL-CRM (Brillant Marble 1200x600)
- NIT-GRN-300 (Nitco Green 300x600)
- RAK-PORT-GOLD (Rak Granite Gold)
- KAJ-BEIGE-1200 (Kajaria Beige)
- SOM-BLUE-300 (Somany Blue)

### Users (7 total)
- **2 Admins** (full access)
- **2 Managers** (approval access)
- **3 Stock Maintainers** (limited access)

---

## 🔍 Verification Commands

```bash
# Check database has data
DATABASE_URL="..." node scripts/verify-seed.js

# View users by role
DATABASE_URL="..." npm run db:query "SELECT role, COUNT(*) FROM stock_app_users GROUP BY role"

# View shipment statuses
DATABASE_URL="..." npm run db:query "SELECT approval_status, COUNT(*) FROM stock_inbound_shipments GROUP BY approval_status"
```

---

## 📈 Dashboard Queries

View these on the dashboard at `/stock/approvals`:

1. **Monthly Inbound Volume** - 6 shipments across the month
2. **Approval Status Breakdown** - See pending vs approved
3. **Items Received** - Total whole and broken quantities
4. **Timeline** - Complete audit trail of all actions

---

## 🛑 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "403 Forbidden" when trying to approve as maintainer | ✅ Expected behavior - maintainers can't approve |
| Can't access `/stock/team` as maintainer | ✅ Expected - link is hidden, access is denied |
| Database query fails | Ensure `schema-stock.sql` was applied to Neon |
| Seed script says "already exists" | ✅ Normal - script is idempotent, data already loaded |
| Missing test users | Check `stock_app_users` table - they should be created by Auth0 |

---

## ✅ Validation Checklist

Use this checklist to verify the system is working:

- [ ] **Admin can access user management**
  - Admin sees `/stock/team` link
  - Can create/edit/delete users

- [ ] **Admin can approve shipments**
  - Admin sees approval buttons on INBOUND shipments
  - Can successfully approve/reject
  - Changes reflected in timeline

- [ ] **Manager can contribute to approvals**
  - Manager sees approval buttons
  - Can approve pending shipments
  - Cannot fully manage users

- [ ] **Maintainer restricted properly**
  - Cannot see `/stock/team` link
  - Cannot see approval buttons
  - Can submit arrivals (POST succeeds)
  - API returns 403 on approval attempts

- [ ] **Monthly data visualization works**
  - Dashboard shows 6 inbound shipments
  - Breakdown shows status distribution
  - Timeline shows all events

- [ ] **Database seeding complete**
  - 100+ records across 18 tables
  - All workflow statuses represented
  - Audit trail populated

---

## 📞 Next Steps

1. **Start dev server**: `npm run dev`
2. **Login as admin**: admin@stock.com
3. **Test approvals**: `/stock/approvals`
4. **Test user management**: `/stock/team`
5. **Check dashboard**: View monthly graphs
6. **Test maintainer denial**: Try as maintainer1@stock.com
7. **Verify API**: Check 403s using browser DevTools

---

## 🎓 Learning Resources

- **Role Model**: See [SEED_DATA_GUIDE.md](SEED_DATA_GUIDE.md)
- **Permission Matrix**: See [BACKEND_SETUP.md](BACKEND_SETUP.md)
- **SQL Reference**: See [schema-stock.sql](schema-stock.sql)
- **Test Data**: See [SEED_COMPLETED.md](SEED_COMPLETED.md)

---

**Last Updated**: Apr 12, 2026  
**Database Status**: ✅ Seeded with comprehensive test data  
**Role Mode**: ✅ 3-role model (admin, manager, stock_maintainer)  
**Monthly Coverage**: ✅ Full month with realistic scenarios
