import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBareKey, matchesKey, parentPath, tabIndexFor } from './shortcuts.mjs';

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

test('1-9 pick a tab only as bare keys', () => {
  const key = (k, mods = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  assert.equal(tabIndexFor(key('1')), 0);
  assert.equal(tabIndexFor(key('9')), 8);
  assert.equal(tabIndexFor(key('0')), -1);
  assert.equal(tabIndexFor(key('F1')), -1);
  assert.equal(tabIndexFor(key('2', { ctrlKey: true })), -1); // Ctrl+2 is the browser's tab
  assert.equal(tabIndexFor(key('2', { metaKey: true })), -1);
  assert.equal(tabIndexFor(key('2', { shiftKey: true })), -1);
  assert.ok(isBareKey(key('/', { shiftKey: true })));
  assert.ok(!isBareKey(key('n', { altKey: true })));
});
