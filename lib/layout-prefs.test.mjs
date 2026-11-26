import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLayout, moveById, moveItem, PREF_KEYS, sanitizeLayout, snapSpan, toSaved } from './layout-prefs.mjs';

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

test('moveById reorders inside the full list, hidden items included', () => {
  const items = [{ id: 'a' }, { id: 'h', hidden: true }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveById(items, 'c', 'b').map((i) => i.id), ['a', 'h', 'c', 'b']);
  assert.deepEqual(moveById(items, 'a', 'c').map((i) => i.id), ['h', 'b', 'c', 'a']);
  assert.equal(moveById(items, 'x', 'a'), items);
});

test('snapSpan rounds a resize drag to the nearest allowed width', () => {
  assert.equal(snapSpan(6, 0, 100), 6);
  assert.equal(snapSpan(6, 90, 100), 6); // 6.9 is still nearer 6 than 8
  assert.equal(snapSpan(6, 120, 100), 8);
  assert.equal(snapSpan(8, 900, 100), 12);
  assert.equal(snapSpan(8, -900, 100), 4);
  assert.equal(snapSpan(6, 50, 0), 6);
});
