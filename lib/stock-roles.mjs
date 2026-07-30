// Single source of truth for stock app roles. Pure — no db/session imports — so it
// can be imported by client components and asserted by scripts/check-role-flags.mjs.
export const STOCK_ROLES = ['admin', 'manager', 'stock_maintainer', 'salesperson', 'read_only_admin'];

export function normalizeStockRole(role) {
  const rawRole = String(role || '').trim().toLowerCase().replace(/\s+/g, '_');

  if (rawRole === 'admin') return 'admin';
  if (rawRole === 'manager' || rawRole === 'stock_approver') return 'manager';
  if (rawRole === 'salesperson' || rawRole === 'sales_person' || rawRole === 'sales') return 'salesperson';
  if (rawRole === 'read_only_admin' || rawRole === 'readonly_admin' || rawRole === 'auditor') return 'read_only_admin';
  return 'stock_maintainer';
}

export function getRoleFlags(role) {
  const normalizedRole = normalizeStockRole(role);
  const isApprover = normalizedRole === 'admin' || normalizedRole === 'manager';

  return {
    role: normalizedRole,
    // Manager is the only role that touches accounts. admin and read_only_admin
    // approve stock and read reports; neither creates, edits or deletes users.
    canManageUsers: normalizedRole === 'manager',
    canApproveChanges: isApprover,
    canViewDashboard: true,
    // read_only_admin sees everything and can export, but writes nothing.
    canCreateDispatch: normalizedRole !== 'read_only_admin',
    isReadOnly: normalizedRole === 'salesperson' || normalizedRole === 'read_only_admin',
    canApprove: isApprover,
    canViewAllAnalytics: isApprover || normalizedRole === 'read_only_admin',
  };
}
