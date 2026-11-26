import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketSlice, parseAnalyticsRange, resolvePreset } from './analytics-range.mjs';

const at = (iso) => new Date(`${iso}T06:30:00Z`); // noon IST
const parse = (qs, now) => parseAnalyticsRange(new URLSearchParams(qs), at(now));

test('financial year turns over on 1 April', () => {
  assert.equal(resolvePreset('fy', '2026-03-31').from, '2025-04-01');
  assert.equal(resolvePreset('fy', '2026-04-01').from, '2026-04-01');
  assert.equal(resolvePreset('ytd', '2026-11-26').from, '2026-01-01');
});

test('presets end today and pick their bucket', () => {
  const six = parse('range=6m', '2026-11-26');
  assert.deepEqual([six.from, six.to, six.bucket, six.bucketCount], ['2026-06-01', '2026-11-26', 'month', 6]);
  assert.equal(six.partialLastBucket, true);
  const month = parse('range=month', '2026-11-26');
  assert.deepEqual([month.from, month.bucket, month.bucketCount], ['2026-11-01', 'day', 26]);
  assert.equal(parse('range=30d', '2026-11-26').from, '2026-10-28');
});

test('62 days is the day/month cut-off', () => {
  assert.equal(parse('from=2026-01-01&to=2026-03-03', '2026-11-26').bucket, 'day'); // 62 days
  assert.equal(parse('from=2026-01-01&to=2026-03-04', '2026-11-26').bucket, 'month');
});

test('custom range is swapped, capped at today and clamped to 24 months', () => {
  const r = parse('from=2026-12-31&to=2020-01-01', '2026-11-26');
  assert.equal(r.to, '2026-11-26');
  assert.equal(r.days, 731);
  const closed = parse('from=2026-09-01&to=2026-09-30', '2026-11-26');
  assert.equal(closed.partialLastBucket, false);
  assert.deepEqual([closed.prevFrom, closed.prevTo], ['2026-08-02', '2026-08-31']);
});

test('old ?months= links and junk input still resolve', () => {
  const old = parse('months=12', '2026-11-26');
  assert.deepEqual([old.from, old.to], ['2025-12-01', '2026-11-26']);
  assert.equal(parse('from=2026-02-30&to=x', '2026-11-26').preset, '6m');
});

test('a clicked bucket is clipped to the range', () => {
  const range = { from: '2026-06-10', to: '2026-11-26' };
  assert.deepEqual(bucketSlice('2026-06-01', 'month', range), { from: '2026-06-10', to: '2026-06-30' });
  assert.deepEqual(bucketSlice('2026-11-01', 'month', range), { from: '2026-11-01', to: '2026-11-26' });
});
