#!/usr/bin/env node
// Guards the access-control matrix. Run: node scripts/check-role-flags.mjs
import assert from 'node:assert/strict';
import { getRoleFlags, normalizeStockRole, STOCK_ROLES } from '../lib/stock-roles.mjs';

// role -> [canManageUsers, canApprove, canCreateDispatch, isReadOnly, canViewAllAnalytics]
const expected = {
  admin: [false, true, true, false, true],
  manager: [true, true, true, false, true],
  stock_maintainer: [false, false, true, false, false],
  salesperson: [false, false, true, true, false],
  read_only_admin: [false, false, false, true, true],
};

for (const [role, [manage, approve, dispatch, readOnly, analytics]] of Object.entries(expected)) {
  const flags = getRoleFlags(role);
  assert.equal(flags.role, role);
  assert.equal(flags.canManageUsers, manage, `${role}.canManageUsers`);
  assert.equal(flags.canApprove, approve, `${role}.canApprove`);
  assert.equal(flags.canApproveChanges, approve, `${role}.canApproveChanges`);
  assert.equal(flags.canCreateDispatch, dispatch, `${role}.canCreateDispatch`);
  assert.equal(flags.isReadOnly, readOnly, `${role}.isReadOnly`);
  assert.equal(flags.canViewAllAnalytics, analytics, `${role}.canViewAllAnalytics`);
}

assert.deepEqual(Object.keys(expected).sort(), [...STOCK_ROLES].sort(), 'STOCK_ROLES drifted from the matrix');

// Unknown/garbage input must land on the least-privileged role, never an admin one.
for (const bogus of [null, undefined, '', 'superuser', 'ADMINISTRATOR', 'root', 'Read Only Admin ']) {
  const flags = getRoleFlags(bogus);
  if (bogus === 'Read Only Admin ') {
    assert.equal(flags.role, 'read_only_admin');
  } else {
    assert.equal(flags.role, 'stock_maintainer', `unknown role ${JSON.stringify(bogus)} must fall back`);
  }
  assert.equal(flags.canManageUsers, false);
  assert.equal(flags.canApprove, false);
}

// Legacy aliases still map to a live role.
assert.equal(normalizeStockRole('stock_approver'), 'manager');
assert.equal(normalizeStockRole('sales'), 'salesperson');
assert.equal(normalizeStockRole('auditor'), 'read_only_admin');

console.log('role flag matrix OK');
