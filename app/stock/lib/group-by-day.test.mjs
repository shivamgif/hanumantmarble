// Run: node app/stock/lib/group-by-day.test.mjs
import assert from 'node:assert/strict';
import { groupRowsByDay } from './group-by-day.mjs';

const now = new Date(2026, 9, 2, 15, 0); // Fri 2 Oct 2026, 3pm local
const rows = [
  { id: 1, at: new Date(2026, 9, 2, 11, 0).toISOString() },
  { id: 2, at: new Date(2026, 9, 2, 9, 30).toISOString() },
  { id: 3, at: '2026-10-01' }, // bare DATE column
  { id: 4, at: '2026-09-29' },
  { id: 5, at: '2025-12-31' },
  { id: 6, at: '2026-09-29' }, // same day as 4 but not adjacent: kept apart
  { id: 7, at: null },
];

const groups = groupRowsByDay(rows, (r) => r.at, { now });
assert.deepEqual(groups.map((g) => g.rows.map((r) => r.id)), [[1, 2], [3], [4], [5], [6], [7]]);
assert.equal(groups[0].label, 'Today');
assert.equal(groups[1].label, 'Yesterday'); // a bare DATE is read as a local day
assert.match(groups[2].label, /29 Sept?/);
assert.doesNotMatch(groups[2].label, /2026/); // this year: no year
assert.match(groups[3].label, /2025/); // other year: year shown
assert.equal(groups[5].label, '—');

assert.equal(groupRowsByDay([], (r) => r.at, { now }).length, 0);
console.log('group-by-day: ok');
