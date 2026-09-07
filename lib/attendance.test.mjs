// Run: node lib/attendance.test.mjs
import assert from 'node:assert/strict';
import {
  entryMinutes,
  openEntryMinutes,
  classifyDay,
  haversineMeters,
  isOutsideGeofence,
  nearestLocation,
  readCoordinate,
  readLatLng,
  workingDaysInMonth,
  leaveDatesInMonth,
  monthlyPay,
  summarizeMonth,
  monthDates,
  toIsoDate,
  formatMinutes,
  DEFAULT_SETTINGS,
} from './attendance.mjs';

const cfg = DEFAULT_SETTINGS;

// --- entryMinutes ----------------------------------------------------------
// A plain 9:30-19:00 day with a 30 min break: 570 gross - 30 = 540.
assert.equal(
  entryMinutes({ clock_in_at: '2026-09-01T09:30:00', clock_out_at: '2026-09-01T19:00:00', break_seconds: 1800 }),
  540
);
// break_seconds arrives from the driver as a string on some paths.
assert.equal(
  entryMinutes({ clock_in_at: '2026-09-01T09:30:00', clock_out_at: '2026-09-01T19:00:00', break_seconds: '1800' }),
  540
);
// An OPEN entry counts zero — otherwise every report would depend on when it ran.
assert.equal(entryMinutes({ clock_in_at: '2026-09-01T09:30:00', clock_out_at: null }), 0);
// Garbage must not produce NaN or a negative.
assert.equal(entryMinutes(null), 0);
assert.equal(entryMinutes({ clock_in_at: 'nope', clock_out_at: 'nope' }), 0);
assert.equal(
  entryMinutes({ clock_in_at: '2026-09-01T09:30:00', clock_out_at: '2026-09-01T10:00:00', break_seconds: 999999 }),
  0
);

// openEntryMinutes ticks against `now`, and an in-progress break is deducted live.
const openStart = new Date('2026-09-01T09:00:00');
const now = new Date('2026-09-01T11:00:00');
assert.equal(openEntryMinutes({ clock_in_at: openStart }, now), 120);
assert.equal(
  openEntryMinutes({ clock_in_at: openStart, break_started_at: new Date('2026-09-01T10:30:00') }, now),
  90
);
// A closed entry is not "open".
assert.equal(openEntryMinutes({ clock_in_at: openStart, clock_out_at: now }, now), 0);

// --- classifyDay -----------------------------------------------------------
const fullDay = classifyDay(540, '2026-09-01T09:30:00', cfg);
assert.equal(fullDay.status, 'present');
assert.equal(fullDay.isLate, false);
assert.equal(fullDay.overtimeMinutes, 60); // 540 worked vs 480 full day

const halfDay = classifyDay(300, '2026-09-01T09:30:00', cfg);
assert.equal(halfDay.status, 'half_day'); // >= 240, < 480
assert.equal(halfDay.overtimeMinutes, 0);

assert.equal(classifyDay(120, '2026-09-01T09:30:00', cfg).status, 'absent');
assert.equal(classifyDay(240, '2026-09-01T09:30:00', cfg).status, 'half_day'); // boundary is inclusive
assert.equal(classifyDay(480, '2026-09-01T09:30:00', cfg).status, 'present');

// Grace period: 15 min. 09:44 is inside, 09:46 is one minute late.
assert.equal(classifyDay(480, '2026-09-01T09:44:00', cfg).isLate, false);
assert.equal(classifyDay(480, '2026-09-01T09:45:00', cfg).isLate, false);
const late = classifyDay(480, '2026-09-01T09:46:00', cfg);
assert.equal(late.isLate, true);
assert.equal(late.lateMinutes, 1);
assert.equal(classifyDay(480, '2026-09-01T10:30:00', cfg).lateMinutes, 45);
// Early arrival is never negative lateness.
assert.equal(classifyDay(480, '2026-09-01T08:00:00', cfg).lateMinutes, 0);

// --- geofence --------------------------------------------------------------
assert.equal(haversineMeters(26.9124, 75.7873, 26.9124, 75.7873), 0);
// ~1 degree of latitude is ~111 km.
const oneDegree = haversineMeters(26.0, 75.0, 27.0, 75.0);
assert.ok(oneDegree > 110000 && oneDegree < 112000, `1 deg lat = ${oneDegree} m`);
// Missing coordinates are unknowable, not a violation.
assert.equal(haversineMeters(null, null, 26.9, 75.7), null);
assert.equal(isOutsideGeofence(null, null, { latitude: 26.9, longitude: 75.7 }, cfg), false);
assert.equal(isOutsideGeofence(26.9, 75.7, {}, cfg), false);
assert.equal(isOutsideGeofence(26.9124, 75.7873, { latitude: 26.9124, longitude: 75.7873 }, cfg), false);
// ~1.1 km away, well beyond the 200 m default radius.
assert.equal(isOutsideGeofence(26.9224, 75.7873, { latitude: 26.9124, longitude: 75.7873 }, cfg), true);

// --- nearestLocation (multi-branch attribution) -----------------------------
// Two showrooms ~11 km apart, plus a warehouse with no coordinates yet.
const branches = [
  { id: 1, name: 'Showroom A', latitude: 26.8467, longitude: 80.9467 },
  { id: 2, name: 'Showroom B', latitude: 26.9467, longitude: 80.9467 },
  { id: 3, name: 'Warehouse', latitude: null, longitude: null },
];

// Standing at B must attribute to B, not to whichever row has the lowest id.
// Picking by id was the original bug: everyone at the second branch was
// recorded at the first and flagged out-of-fence every day.
assert.equal(nearestLocation(26.9467, 80.9467, branches).location.id, 2);
assert.equal(nearestLocation(26.8467, 80.9467, branches).location.id, 1);
// Just past the midpoint tips to the nearer branch.
assert.equal(nearestLocation(26.8900, 80.9467, branches).location.id, 1);
assert.equal(nearestLocation(26.9000, 80.9467, branches).location.id, 2);
// Distance comes back so the caller can flag; being far is not an error.
const atA = nearestLocation(26.8467, 80.9467, branches);
assert.equal(atA.distance, 0);
assert.ok(nearestLocation(27.5, 80.9467, branches).distance > 50000);
// An un-anchored location can never be "nearest" — it would swallow punches.
assert.notEqual(nearestLocation(26.8467, 80.9467, branches).location.id, 3);
assert.equal(nearestLocation(26.8467, 80.9467, [branches[2]]), null);
// No fix, or nothing to compare against, is null — the caller falls back.
assert.equal(nearestLocation(null, null, branches), null);
assert.equal(nearestLocation(26.8467, 80.9467, []), null);
assert.equal(nearestLocation(26.8467, 80.9467), null);

// The fence is then measured against the branch actually chosen, so a punch at
// B is inside B's fence rather than 11 km outside A's.
const settingsAt200 = { ...cfg, geofence_radius_m: 200 };
assert.equal(isOutsideGeofence(26.9467, 80.9467, branches[1], settingsAt200), false);
assert.equal(isOutsideGeofence(26.9467, 80.9467, branches[0], settingsAt200), true);

// --- readCoordinate ---------------------------------------------------------
// The gate between a browser reading and a NUMERIC(9,6) column.
assert.equal(readCoordinate(26.8467, 90), 26.8467);
assert.equal(readCoordinate('26.846700', 90), 26.8467); // form input is a string
assert.equal(readCoordinate(26.84671234, 90), 26.846712); // rounded to the column precision
assert.equal(readCoordinate(80.9467, 180), 80.9467);
// 0 is a real coordinate on the equator/prime meridian — absence, not falsiness.
assert.equal(readCoordinate(0, 90), 0);
// Out of range, missing, or nonsense must all be null so the caller can reject.
assert.equal(readCoordinate(91, 90), null);
assert.equal(readCoordinate(-91, 90), null);
assert.equal(readCoordinate(181, 180), null);
assert.equal(readCoordinate(null, 90), null);
assert.equal(readCoordinate(undefined, 90), null);
assert.equal(readCoordinate('', 90), null);
assert.equal(readCoordinate('abc', 90), null);

// readLatLng applies the right limit to each axis: 100 is a valid longitude
// but not a valid latitude.
assert.deepEqual(readLatLng({ lat: 26.8467, lng: 80.9467 }), { lat: 26.8467, lng: 80.9467 });
assert.deepEqual(readLatLng({ lat: 100, lng: 100 }), { lat: null, lng: 100 });
assert.deepEqual(readLatLng({}), { lat: null, lng: null });
assert.deepEqual(readLatLng(undefined), { lat: null, lng: null });

// The route's "half a coordinate is not a location" guard: one axis surviving
// must not be treated as a configured fence.
const halfPair = readLatLng({ lat: 26.8467 });
assert.ok(halfPair.lat !== null && halfPair.lng === null, 'half a pair must be detectable');

// --- working days ----------------------------------------------------------
// September 2026 has 30 days. Verify the calendar itself first.
assert.equal(monthDates('2026-09').length, 30);
assert.equal(monthDates('2026-02').length, 28);
assert.equal(monthDates('2024-02').length, 29); // leap year
assert.equal(monthDates('garbage').length, 0);

// 2026-09-01 is a Tuesday, so the Sundays are the 6th, 13th, 20th and 27th.
assert.equal(workingDaysInMonth('2026-09', [], cfg), 26);
// A holiday on a weekday subtracts one...
assert.equal(workingDaysInMonth('2026-09', [{ holiday_date: '2026-09-02' }], cfg), 25);
// ...but a holiday landing on the weekly off must NOT be subtracted twice.
assert.equal(workingDaysInMonth('2026-09', [{ holiday_date: '2026-09-06' }], cfg), 26);
// Timestamps from the driver carry a time part; only the date should matter.
assert.equal(workingDaysInMonth('2026-09', [{ holiday_date: '2026-09-02T00:00:00.000Z' }], cfg), 25);

// --- leave ------------------------------------------------------------------
const leave = leaveDatesInMonth('2026-09', [
  { status: 'approved', leave_type: 'paid', from_date: '2026-09-02', to_date: '2026-09-04' },
  { status: 'approved', leave_type: 'unpaid', from_date: '2026-09-08', to_date: '2026-09-08' },
  { status: 'pending', leave_type: 'paid', from_date: '2026-09-10', to_date: '2026-09-12' },
  // Spills in from August — only the September part counts.
  { status: 'approved', leave_type: 'paid', from_date: '2026-08-28', to_date: '2026-09-01' },
]);
assert.equal(leave.paid.size, 4); // 1st, 2nd, 3rd, 4th
assert.equal(leave.unpaid.size, 1);
assert.ok(leave.paid.has('2026-09-01'));
assert.ok(!leave.paid.has('2026-09-10'), 'pending leave must not count');

// --- monthlyPay -------------------------------------------------------------
// 26000 / 26 working days = 1000/day. 20 present + 2 half + 1 paid leave
// = 22 paid days = 22000.
const pay = monthlyPay({
  salary: 26000,
  workingDays: 26,
  presentDays: 20,
  halfDays: 2,
  paidLeaveDays: 1,
  overtimeMinutes: 0,
  settings: cfg,
});
assert.equal(pay.perDay, 1000);
assert.equal(pay.paidDays, 22);
assert.equal(pay.earnedBase, 22000);
assert.equal(pay.deductions, 4000);
assert.equal(pay.netPay, 22000);

// Overtime: 1000/day over an 8h day = 125/h, x1.5 = 187.5/h. 4h = 750.
const otPay = monthlyPay({ salary: 26000, workingDays: 26, presentDays: 26, overtimeMinutes: 240, settings: cfg });
assert.equal(otPay.overtimePay, 750);
assert.equal(otPay.netPay, 26750);
assert.equal(otPay.deductions, 0);

// Salary arrives from NUMERIC as a string — must not string-concatenate.
assert.equal(monthlyPay({ salary: '26000.00', workingDays: 26, presentDays: 26, settings: cfg }).netPay, 26000);
// No salary or no working days must never produce NaN/Infinity in a payslip.
assert.equal(monthlyPay({ salary: null, workingDays: 26, presentDays: 20, settings: cfg }).netPay, 0);
assert.equal(monthlyPay({ salary: 26000, workingDays: 0, presentDays: 20, settings: cfg }).netPay, 0);
assert.equal(monthlyPay({}).netPay, 0);

// --- summarizeMonth (end to end) -------------------------------------------
const summary = summarizeMonth({
  month: '2026-09',
  salary: 26000,
  settings: cfg,
  holidays: [],
  leaveRequests: [{ status: 'approved', leave_type: 'paid', from_date: '2026-09-03', to_date: '2026-09-03' }],
  entries: [
    // A full day with an hour of overtime.
    { work_date: '2026-09-01', clock_in_at: '2026-09-01T09:30:00', clock_out_at: '2026-09-01T19:00:00', break_seconds: 0 },
    // A late half day.
    { work_date: '2026-09-02', clock_in_at: '2026-09-02T11:00:00', clock_out_at: '2026-09-02T16:00:00', break_seconds: 0 },
    // Two sessions on ONE date must roll up into a single present day.
    { work_date: '2026-09-04', clock_in_at: '2026-09-04T09:30:00', clock_out_at: '2026-09-04T13:30:00', break_seconds: 0 },
    { work_date: '2026-09-04', clock_in_at: '2026-09-04T14:00:00', clock_out_at: '2026-09-04T18:00:00', break_seconds: 0 },
    // A soft-deleted row must be ignored entirely.
    { work_date: '2026-09-07', clock_in_at: '2026-09-07T09:30:00', clock_out_at: '2026-09-07T19:00:00', is_active: false },
    // An open entry contributes nothing yet.
    { work_date: '2026-09-08', clock_in_at: '2026-09-08T09:30:00', clock_out_at: null },
  ],
});

assert.equal(summary.workingDays, 26);
assert.equal(summary.presentDays, 2, 'the 1st and the rolled-up 4th');
assert.equal(summary.halfDays, 1, 'the 2nd');
assert.equal(summary.lateDays, 1, 'the 2nd, arrived 11:00');
assert.equal(summary.paidLeaveDays, 1, 'the 3rd');
assert.equal(summary.overtimeMinutes, 90, '60 on the 1st + 30 on the 4th (510 worked)');
assert.equal(summary.days.length, 30);
assert.equal(summary.days.find((d) => d.date === '2026-09-06').status, 'weekly_off');
assert.equal(summary.days.find((d) => d.date === '2026-09-03').status, 'paid_leave');
assert.equal(summary.days.find((d) => d.date === '2026-09-07').status, 'absent', 'soft-deleted entry ignored');
assert.equal(summary.days.find((d) => d.date === '2026-09-08').status, 'absent', 'open entry earns nothing yet');

// 1000/day x (2 present + 1 paid leave + 0.5 half) = 3500, plus 1.5h OT at 187.5 = 281.25
assert.equal(summary.perDay, 1000);
assert.equal(summary.paidDays, 3.5);
assert.equal(summary.earnedBase, 3500);
assert.equal(summary.overtimePay, 281.25);
assert.equal(summary.netPay, 3781.25);

// An employee with nothing recorded is absent all month, not NaN.
const empty = summarizeMonth({ month: '2026-09', salary: 26000, settings: cfg });
assert.equal(empty.presentDays, 0);
assert.equal(empty.netPay, 0);
assert.equal(empty.absentDays, 26);

// --- driver types -----------------------------------------------------------
// The pg driver returns DATE as a Date built at LOCAL midnight and NUMERIC as a
// string. Passing those straight through used to drop every entry on the floor,
// because String(aDate).slice(0,10) is "Fri Sep 01", which matches no calendar
// day. toISOString() is equally wrong east of UTC. This is the regression.
assert.equal(toIsoDate(new Date(2026, 8, 1)), '2026-09-01');
assert.equal(toIsoDate(new Date(2026, 0, 5)), '2026-01-05');
assert.equal(toIsoDate('2026-09-01T00:00:00.000Z'), '2026-09-01');
assert.equal(toIsoDate(null), '');

const driverShaped = summarizeMonth({
  month: '2026-09',
  salary: '26000.00', // NUMERIC -> string
  settings: {
    ...cfg,
    overtime_multiplier: '1.50', // NUMERIC -> string
    full_day_minutes: 480,
  },
  holidays: [{ holiday_date: new Date(2026, 8, 2) }], // DATE -> Date
  leaveRequests: [
    { status: 'approved', leave_type: 'paid', from_date: new Date(2026, 8, 3), to_date: new Date(2026, 8, 3) },
  ],
  entries: [
    { work_date: new Date(2026, 8, 1), clock_in_at: '2026-09-01T09:30:00', clock_out_at: '2026-09-01T19:00:00', break_seconds: '0' },
    { work_date: new Date(2026, 8, 4), clock_in_at: '2026-09-04T09:30:00', clock_out_at: '2026-09-04T17:30:00', break_seconds: '0' },
  ],
});
assert.equal(driverShaped.presentDays, 2, 'Date work_date must group, not be dropped');
assert.equal(driverShaped.paidLeaveDays, 1, 'Date leave bounds must resolve');
assert.equal(driverShaped.workingDays, 25, 'Date holiday must subtract (26 - 1)');
// 09:30-19:00 unbroken is 570 min = 90 over the 480 full day; the second entry
// is exactly 480 and contributes none.
assert.equal(driverShaped.overtimeMinutes, 90);
assert.ok(driverShaped.netPay > 0 && Number.isFinite(driverShaped.netPay), 'string salary must not poison the math');

// --- formatting -------------------------------------------------------------
assert.equal(formatMinutes(540), '9h 00m');
assert.equal(formatMinutes(95), '1h 35m');
assert.equal(formatMinutes(0), '0h 00m');
assert.equal(formatMinutes(-5), '0h 00m');

console.log('✓ attendance: all assertions passed');
