// Asserts the sales-streak derivation. Run: node scripts/check-streak.mjs
import assert from 'node:assert/strict';
import { deriveStreak, streakTier, goalTier } from '../app/stock/analytics/lib/streak.mjs';

// Ran Mon-Fri, quiet weekend, back at it Mon..Wed (today).
const days = [
  '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
  '2026-07-20', '2026-07-21', '2026-07-22',
];

const s = deriveStreak(days, '2026-07-22');
assert.equal(s.current, 3, 'current run is Mon-Wed');
assert.equal(s.best, 5, 'best run is the Mon-Fri week');
assert.equal(s.activeToday, true);
assert.equal(s.activeThisMonth, 8);
assert.deepEqual(
  s.last7.map((d) => d.active),
  [true, true, false, false, true, true, true],
  'last7 is oldest-first: Thu Fri (weekend off) Mon Tue Wed'
);
assert.equal(s.last7[6].date, '2026-07-22', 'last7 ends on today');
assert.equal(s.last7[0].date, '2026-07-16', 'last7 starts 6 days back');

// A quiet today must not break a live streak - the day isn't over.
const quietToday = deriveStreak(days, '2026-07-23');
assert.equal(quietToday.current, 3, 'streak survives an as-yet-empty today');
assert.equal(quietToday.activeToday, false);

// Two quiet days does break it.
assert.equal(deriveStreak(days, '2026-07-24').current, 0);

// Duplicates (several dispatches in one day) count once.
assert.equal(deriveStreak(['2026-07-22', '2026-07-22', '2026-07-21'], '2026-07-22').current, 2);

// Month boundaries are just date arithmetic, not calendar months.
assert.equal(deriveStreak(['2026-06-30', '2026-07-01'], '2026-07-01').current, 2);
assert.equal(deriveStreak(['2026-06-30', '2026-07-01'], '2026-07-01').activeThisMonth, 1);

// Empty / null payloads must not throw.
const empty = deriveStreak([], '2026-07-22');
assert.equal(empty.current, 0);
assert.equal(empty.best, 0);
assert.equal(empty.last7.filter((d) => d.active).length, 0);
assert.deepEqual(deriveStreak(null, '2026-07-22').current, 0);

// A single active today is a streak of 1, and best never trails current.
const one = deriveStreak(['2026-07-22'], '2026-07-22');
assert.equal(one.current, 1);
assert.equal(one.best, 1);

// Tiers
assert.equal(streakTier(0).label, 'No Streak Yet');
assert.equal(streakTier(1).emoji, '🌱');
assert.equal(streakTier(3).emoji, '⚡');
assert.equal(streakTier(7).emoji, '🔥');
assert.equal(streakTier(30).label, 'Unstoppable');
assert.equal(streakTier(undefined).label, 'No Streak Yet', 'missing streak falls back, never crashes');

// Goal tiers are judged against the pace-adjusted expectation, not the flat goal.
assert.equal(goalTier(120, 70).emoji, '🏆');
assert.equal(goalTier(80, 70).label, 'Ahead Of Pace');
assert.equal(goalTier(60, 70).label, 'On Track', '60 of an expected 70 is still on track');
assert.equal(goalTier(40, 70).label, 'Behind Pace');
assert.equal(goalTier(5, 70).emoji, '🆘');
assert.equal(goalTier(0, 0).label, 'Ahead Of Pace', 'day 1 of the month: any progress beats a 0 expectation');

console.log('check-streak: all assertions passed');
