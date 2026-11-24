import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesKey, parentPath } from './shortcuts.mjs';

test('Esc goes up one screen, and stops at the dashboard', () => {
  assert.equal(parentPath('/stock/invoices/42', ''), '/stock/invoices');
  assert.equal(parentPath('/stock/invoices', ''), '/stock');
  assert.equal(parentPath('/stock/invoices', '?new=estimate'), '/stock/invoices');
  assert.equal(parentPath('/stock', '?view=dispatches'), '/stock');
  assert.equal(parentPath('/stock', ''), null);
});

test('F-keys match only with the right modifiers', () => {
  const key = (k, mods = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, ...mods });
  assert.ok(matchesKey('F8', key('F8')));
  assert.ok(!matchesKey('F8', key('F8', { altKey: true })));
  assert.ok(matchesKey('Alt+F8', key('F8', { altKey: true })));
  assert.ok(!matchesKey('Alt+F8', key('F8')));
  assert.ok(!matchesKey('F9', key('F9', { ctrlKey: true })));
  assert.ok(!matchesKey(undefined, key('F9')));
});
