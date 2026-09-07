// Attendance + payroll arithmetic. Pure — no db/session/React imports — so
// client components, API routes and lib/attendance.test.mjs can all import it.
// Same arrangement as lib/stock-roles.mjs.
//
// Two things bite here and are handled at every boundary:
//   1. NUMERIC columns come back from the Neon driver as STRINGS. Everything
//      numeric is pushed through num() before arithmetic. This is the same
//      reason lib/stock-sqft.js exists.
//   2. Money must not carry float noise into a NUMERIC column, so every rupee
//      figure this module returns is rounded to 2 dp.

export const DEFAULT_SETTINGS = {
  shift_start: '09:30',
  shift_end: '19:00',
  full_day_minutes: 480,
  half_day_minutes: 240,
  grace_minutes: 15,
  weekly_off_dow: 0,
  overtime_multiplier: 1.5,
  geofence_radius_m: 200,
};

export function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function money(value) {
  return Math.round(num(value) * 100) / 100;
}

/** Fill in any missing/garbage setting from the defaults, coercing driver strings. */
export function normalizeSettings(settings) {
  const s = settings || {};
  return {
    shift_start: s.shift_start || DEFAULT_SETTINGS.shift_start,
    shift_end: s.shift_end || DEFAULT_SETTINGS.shift_end,
    full_day_minutes: num(s.full_day_minutes, DEFAULT_SETTINGS.full_day_minutes),
    half_day_minutes: num(s.half_day_minutes, DEFAULT_SETTINGS.half_day_minutes),
    grace_minutes: num(s.grace_minutes, DEFAULT_SETTINGS.grace_minutes),
    weekly_off_dow: num(s.weekly_off_dow, DEFAULT_SETTINGS.weekly_off_dow),
    overtime_multiplier: num(s.overtime_multiplier, DEFAULT_SETTINGS.overtime_multiplier),
    geofence_radius_m: num(s.geofence_radius_m, DEFAULT_SETTINGS.geofence_radius_m),
  };
}

/**
 * Worked minutes for one entry. An entry that is still open counts 0 — an
 * in-progress shift is not yet worked time, and letting it accrue would make
 * every report depend on when it was run.
 */
export function entryMinutes(entry) {
  if (!entry || !entry.clock_in_at || !entry.clock_out_at) return 0;

  const inAt = new Date(entry.clock_in_at).getTime();
  const outAt = new Date(entry.clock_out_at).getTime();
  if (!Number.isFinite(inAt) || !Number.isFinite(outAt) || outAt <= inAt) return 0;

  const gross = (outAt - inAt) / 60000;
  const breaks = num(entry.break_seconds) / 60;
  return Math.max(0, Math.round(gross - breaks));
}

/** Minutes elapsed on a still-open entry, for the live "you have been in for..." counter. */
export function openEntryMinutes(entry, now = new Date()) {
  if (!entry || !entry.clock_in_at || entry.clock_out_at) return 0;

  const inAt = new Date(entry.clock_in_at).getTime();
  if (!Number.isFinite(inAt)) return 0;

  let breaks = num(entry.break_seconds);
  if (entry.break_started_at) {
    const breakAt = new Date(entry.break_started_at).getTime();
    if (Number.isFinite(breakAt)) breaks += Math.max(0, (now.getTime() - breakAt) / 1000);
  }
  return Math.max(0, Math.round((now.getTime() - inAt) / 60000 - breaks / 60));
}

function minutesIntoDay(date) {
  const d = new Date(date);
  return Number.isFinite(d.getTime()) ? d.getHours() * 60 + d.getMinutes() : null;
}

function parseClock(hhmm) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Classify one day's worked minutes against the company-wide rules.
 * Late is measured from shift_start plus the grace period; overtime from
 * full_day_minutes. Both are reported in minutes so the caller can format.
 */
export function classifyDay(minutes, clockInAt, settings) {
  const cfg = normalizeSettings(settings);
  const worked = Math.max(0, num(minutes));

  let status = 'absent';
  if (worked >= cfg.full_day_minutes) status = 'present';
  else if (worked >= cfg.half_day_minutes) status = 'half_day';

  const shiftStart = parseClock(cfg.shift_start);
  const arrived = clockInAt ? minutesIntoDay(clockInAt) : null;
  const lateMinutes =
    shiftStart !== null && arrived !== null
      ? Math.max(0, arrived - shiftStart - cfg.grace_minutes)
      : 0;

  return {
    status,
    isLate: lateMinutes > 0,
    lateMinutes,
    overtimeMinutes: Math.max(0, worked - cfg.full_day_minutes),
    workedMinutes: worked,
  };
}

/**
 * A coordinate that is actually present. Number(null) and Number('') are both
 * 0, which is a real place in the Gulf of Guinea — coercing a missing reading
 * that way would flag every GPS-denied punch as outside the fence.
 */
function coord(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Great-circle distance in metres, or null if any coordinate is missing. */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const a1 = coord(lat1);
  const o1 = coord(lng1);
  const a2 = coord(lat2);
  const o2 = coord(lng2);
  if ([a1, o1, a2, o2].some((v) => v === null)) return null;

  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(a2 - a1);
  const dLng = toRad(o2 - o1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * A latitude/longitude that a browser actually reported. Rejects out-of-range
 * and non-numeric values before they reach a NUMERIC(9,6) column, rounds to the
 * column's precision, and treats a missing reading as missing rather than 0,0.
 * Note 0 IS a valid coordinate, so the check is for absence, not falsiness.
 */
export function readCoordinate(value, limit) {
  const n = coord(value);
  if (n === null || Math.abs(n) > limit) return null;
  return Math.round(n * 1e6) / 1e6;
}

export function readLatLng(body) {
  return {
    lat: readCoordinate(body?.lat, 90),
    lng: readCoordinate(body?.lng, 180),
  };
}

/**
 * Outside the fence only when we can actually prove it. Missing coordinates on
 * either side (GPS denied, indoors, location not configured) is NOT a violation
 * — punches are recorded and flagged, never blocked.
 */
export function isOutsideGeofence(lat, lng, location, settings) {
  const distance = haversineMeters(lat, lng, location?.latitude, location?.longitude);
  if (distance === null) return false;
  return distance > normalizeSettings(settings).geofence_radius_m;
}

/**
 * A DATE column as "YYYY-MM-DD". The pg driver hands back a Date built at LOCAL
 * midnight, so two wrong answers are easy here:
 *   String(date)        -> "Fri Sep 01 2026 …", which slices to "Fri Sep 01"
 *   date.toISOString()  -> shifts back a day anywhere east of UTC (IST is +5:30,
 *                          so local midnight on the 1st is 18:30 UTC on Aug 31)
 * Read the local calendar fields instead. Strings pass through untouched.
 */
export function toIsoDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

/** "YYYY-MM" -> { year, month } (month 1-12), or null if malformed. */
export function parseMonth(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) return null;
  return { year, month: mon };
}

/** All "YYYY-MM-DD" dates in a month, in order. */
export function monthDates(month) {
  const parsed = parseMonth(month);
  if (!parsed) return [];

  const days = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  const mm = String(parsed.month).padStart(2, '0');
  return Array.from({ length: days }, (_, i) => `${parsed.year}-${mm}-${String(i + 1).padStart(2, '0')}`);
}

/** Day of week for a "YYYY-MM-DD" string, 0=Sunday. Parsed as UTC so the
 *  server's timezone cannot shift a date across a boundary. */
export function dayOfWeek(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/**
 * Payroll denominator: calendar days minus the weekly off minus holidays.
 * A holiday that lands on the weekly off is not subtracted twice.
 */
export function workingDaysInMonth(month, holidays = [], settings) {
  const cfg = normalizeSettings(settings);
  const holidaySet = new Set((holidays || []).map((h) => toIsoDate(h?.holiday_date ?? h)));

  return monthDates(month).filter(
    (date) => dayOfWeek(date) !== cfg.weekly_off_dow && !holidaySet.has(date)
  ).length;
}

/** Every "YYYY-MM-DD" covered by an approved leave request, clipped to the month. */
export function leaveDatesInMonth(month, leaveRequests = []) {
  const dates = new Set(monthDates(month));
  const paid = new Set();
  const unpaid = new Set();

  for (const request of leaveRequests || []) {
    if (request?.status !== 'approved') continue;

    const from = toIsoDate(request.from_date);
    const to = toIsoDate(request.to_date);
    if (!from || !to) continue;

    const bucket = request.leave_type === 'unpaid' ? unpaid : paid;
    for (const date of dates) {
      if (date >= from && date <= to) bucket.add(date);
    }
  }

  // Paid wins if a date is somehow covered by both.
  for (const date of paid) unpaid.delete(date);
  return { paid, unpaid };
}

/**
 * Monthly pay from a monthly salary, prorated by days actually worked.
 *
 *   perDay  = salary / workingDaysInMonth
 *   base    = perDay x (presentDays + paidLeaveDays + halfDays/2)
 *   otRate  = (perDay / fullDayHours) x overtimeMultiplier, per hour
 *
 * A half day earns half. Unpaid leave and absences simply do not earn, so
 * "deductions" is reported for the payslip rather than subtracted twice.
 */
export function monthlyPay({
  salary,
  workingDays,
  presentDays = 0,
  halfDays = 0,
  paidLeaveDays = 0,
  overtimeMinutes = 0,
  settings,
} = {}) {
  const cfg = normalizeSettings(settings);
  const monthlySalary = num(salary);
  const divisor = num(workingDays);

  if (divisor <= 0 || monthlySalary <= 0) {
    return { perDay: 0, paidDays: 0, earnedBase: 0, overtimePay: 0, deductions: 0, netPay: 0 };
  }

  const perDay = monthlySalary / divisor;
  const paidDays = num(presentDays) + num(paidLeaveDays) + num(halfDays) / 2;

  const fullDayHours = cfg.full_day_minutes / 60;
  const overtimeRate = fullDayHours > 0 ? (perDay / fullDayHours) * cfg.overtime_multiplier : 0;
  const overtimePay = (num(overtimeMinutes) / 60) * overtimeRate;

  const earnedBase = perDay * paidDays;

  return {
    perDay: money(perDay),
    paidDays: Math.round(paidDays * 100) / 100,
    earnedBase: money(earnedBase),
    overtimePay: money(overtimePay),
    // What the absent/unpaid days cost them, for the payslip line.
    deductions: money(Math.max(0, monthlySalary - earnedBase)),
    netPay: money(earnedBase + overtimePay),
  };
}

/**
 * Roll a month of entries for ONE employee into the payroll inputs.
 * Entries are grouped by work_date first: two sessions in a day are one day.
 */
export function summarizeMonth({ month, entries = [], leaveRequests = [], holidays = [], settings, salary } = {}) {
  const cfg = normalizeSettings(settings);
  const byDate = new Map();

  for (const entry of entries) {
    if (entry?.is_active === false) continue;
    const date = toIsoDate(entry?.work_date);
    if (!date) continue;

    const existing = byDate.get(date) || { minutes: 0, firstIn: null };
    existing.minutes += entryMinutes(entry);
    if (!existing.firstIn || new Date(entry.clock_in_at) < new Date(existing.firstIn)) {
      existing.firstIn = entry.clock_in_at;
    }
    byDate.set(date, existing);
  }

  const { paid: paidLeave, unpaid: unpaidLeave } = leaveDatesInMonth(month, leaveRequests);
  const workingDays = workingDaysInMonth(month, holidays, cfg);

  const days = [];
  let presentDays = 0;
  let halfDays = 0;
  let lateDays = 0;
  let overtimeMinutes = 0;
  let workedMinutes = 0;

  for (const date of monthDates(month)) {
    const day = byDate.get(date);
    const isWeeklyOff = dayOfWeek(date) === cfg.weekly_off_dow;
    const verdict = classifyDay(day?.minutes || 0, day?.firstIn, cfg);

    let status = verdict.status;
    if (!day) {
      if (paidLeave.has(date)) status = 'paid_leave';
      else if (unpaidLeave.has(date)) status = 'unpaid_leave';
      else if (isWeeklyOff) status = 'weekly_off';
    }

    if (status === 'present') presentDays += 1;
    if (status === 'half_day') halfDays += 1;
    if (verdict.isLate && day) lateDays += 1;
    overtimeMinutes += verdict.overtimeMinutes;
    workedMinutes += verdict.workedMinutes;

    // verdict carries its own `status`; spread it FIRST so the leave/weekly-off
    // status computed above wins.
    days.push({ ...verdict, date, status });
  }

  const pay = monthlyPay({
    salary,
    workingDays,
    presentDays,
    halfDays,
    paidLeaveDays: paidLeave.size,
    overtimeMinutes,
    settings: cfg,
  });

  return {
    month,
    workingDays,
    presentDays,
    halfDays,
    lateDays,
    absentDays: Math.max(0, workingDays - presentDays - halfDays - paidLeave.size - unpaidLeave.size),
    paidLeaveDays: paidLeave.size,
    unpaidLeaveDays: unpaidLeave.size,
    workedMinutes,
    overtimeMinutes,
    days,
    ...pay,
  };
}

/** "7h 30m" for display. */
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(num(minutes)));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}
