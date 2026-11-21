import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLayout, moveItem, PREF_KEYS, sanitizeLayout, toSaved } from './layout-prefs.mjs';

const defaults = [{ id: 'a', span: 8 }, { id: 'b', span: 4 }, { id: 'c', span: 12 }];

test('no saved layout gives the defaults', () => {
  assert.deepEqual(mergeLayout(defaults, undefined), [
    { id: 'a', span: 8, hidden: false },
    { id: 'b', span: 4, hidden: false },
    { id: 'c', span: 12, hidden: false },
  ]);
});

test('saved order, spans and hidden apply; unknown ids are dropped', () => {
  const merged = mergeLayout(defaults, { order: ['c', 'gone', 'a', 'b'], span: { a: 6, b: 5, gone: 4 }, hidden: ['b', 'gone'] });
  assert.deepEqual(merged, [
    { id: 'c', span: 12, hidden: false },
    { id: 'a', span: 6, hidden: false },
    { id: 'b', span: 4, hidden: true }, // 5 is not a valid span: default kept
  ]);
});

test('a new widget lands after its default-order neighbour', () => {
  const merged = mergeLayout(defaults, { order: ['c', 'a'] });
  assert.deepEqual(merged.map((item) => item.id), ['c', 'a', 'b']);
  const first = mergeLayout(defaults, { order: ['c', 'b'] });
  assert.deepEqual(first.map((item) => item.id), ['a', 'c', 'b']);
});

test('sanitize drops junk; toSaved round-trips; keys are whitelisted', () => {
  assert.deepEqual(sanitizeLayout({ order: ['a', 'a', 1, '<x>'], span: { a: 12, b: '6' }, hidden: 'b' }), { order: ['a'], span: { a: 12 }, hidden: [] });
  const merged = mergeLayout(defaults, { order: ['b', 'a', 'c'], hidden: ['c'] });
  assert.deepEqual(mergeLayout(defaults, toSaved(merged)), merged);
  assert.ok(PREF_KEYS.test('analytics.sales') && PREF_KEYS.test('nav'));
  assert.ok(!PREF_KEYS.test('analytics.sales.x') && !PREF_KEYS.test('theme'));
});

test('moveItem', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b'], 1, 5), ['a', 'b']);
});
