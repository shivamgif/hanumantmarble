import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, isApprovedStaff, normalizeStockRole, requestTenant, stockRoute } from '@/lib/stock-workflow';
import { companyProfile } from '@/lib/company';

/**
 * Who the signed-in person is in the stock app, and in which company.
 *
 * Nobody is created here any more. A company's manager adds staff by email
 * (Admin → Users), and new companies are created by the operator
 * (scripts/create-tenant.mjs). Someone signed in with no staff row anywhere
 * just gets told to ask their admin.
 */
export const GET = stockRoute(async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  const { tenant, tenants } = requestTenant(request);
  // Own row only (RLS policy tenant_self), for the name and logo in the app chrome.
  const profile = appUser ? await companyProfile() : null;
  const approved = isApprovedStaff(appUser);

  let message = 'Access granted.';
  if (!appUser) {
    message = session.user.emailVerified === true
      ? `${session.user.email} is not on any company's staff list. Ask your company's admin to add this email in Admin → Users.`
      : 'Your email address is not verified yet. Sign in with Google, or ask your company\'s admin to add you in Admin → Users.';
  } else if (!approved) {
    message = 'Your account is waiting for your company\'s admin to activate it.';
  }

  return NextResponse.json({
    approved,
    status: appUser?.status || 'inactive',
    role: normalizeStockRole(appUser?.role),
    user: appUser,
    // The company this request opened, and every company this person can switch to.
    tenant: appUser && tenant && profile
      ? { id: profile.id, name: profile.name, logo: profile.logo, logoDark: profile.logoDark, accent: profile.accent }
      : null,
    tenants,
    message,
  });
}, { allowUnapproved: true });
