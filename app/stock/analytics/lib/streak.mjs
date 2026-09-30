// Sales streak derived from the days a salesperson actually dispatched.
// Plain module (no React) so scripts/check-streak.mjs can assert on it.
//
// `activeDays` is the ISO date list (YYYY-MM-DD, already shifted to Asia/Kolkata)
// from /api/stock/salesperson-analytics; `today` is that same date for "now".

const DAY_MS = 86400000;

const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const toMs = (key) => Date.parse(`${key}T00:00:00Z`);

// Days off neither add to a streak nor break it: the weekly off day from the
// attendance settings (weeklyOffDow, 0 = Sunday .. 6 = Saturday, UTC day of the
// IST date key) and any listed holidays. A dispatch on a day off still counts.
export function deriveStreak(activeDays, today, { weeklyOffDow = null, holidays = [] } = {}) {
  const days = [...new Set((activeDays || []).filter(Boolean).map(String))].sort();
  const set = new Set(days);
  const holidaySet = new Set((holidays || []).filter(Boolean).map((d) => String(d).slice(0, 10)));
  const todayKey = today || toKey(Date.now());
  const todayMs = toMs(todayKey);
  const isOff = (ms) =>
    (weeklyOffDow != null && new Date(ms).getUTCDay() === Number(weeklyOffDow)) || holidaySet.has(toKey(ms));

  // True when every day strictly between two active days was a day off.
  const bridged = (fromKey, toKeyExclusive) => {
    for (let t = toMs(fromKey) + DAY_MS; t < toMs(toKeyExclusive); t += DAY_MS) {
      if (!isOff(t)) return false;
    }
    return true;
  };

  // ponytail: best run is only the best inside the fetched window (120 days).
  // Widen the API interval if an all-time record is ever wanted.
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev !== null && bridged(prev, d) ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }

  // Count back from today. A quiet today must not break the streak - the day
  // isn't over yet - and a quiet day off is stepped over rather than ending it.
  // The cap only guards against a holiday list covering months on end.
  // The workday that stopped the count is where the streak was lost; null if
  // there is no activity at all to have lost.
  let current = 0;
  let brokenOn = null;
  for (let cursor = todayMs, step = 0; step < 400; cursor -= DAY_MS, step += 1) {
    if (set.has(toKey(cursor))) current += 1;
    else if (isOff(cursor) || cursor === todayMs) continue;
    else {
      brokenOn = days.length ? toKey(cursor) : null;
      break;
    }
  }

  const month = todayKey.slice(0, 7);
  return {
    current,
    best: Math.max(best, current),
    brokenOn,
    activeToday: set.has(todayKey),
    activeThisMonth: days.filter((d) => d.startsWith(month)).length,
    // Last 7 days oldest-first, for the day row on the streak card. Exactly one
    // state per day: a dispatch wins, then a day off, then today (still open),
    // and anything else is a missed workday.
    last7: Array.from({ length: 7 }, (_, i) => {
      const ms = todayMs - (6 - i) * DAY_MS;
      const key = toKey(ms);
      const active = set.has(key);
      const off = isOff(ms);
      const state = active ? 'active' : off ? 'off' : ms === todayMs ? 'today' : 'missed';
      return { date: key, active, off, state };
    }),
  };
}

// Tier ladder: drives the emoji, copy and colour of the streak card.
// Ordered high -> low; first match wins.
export const STREAK_TIERS = [
  { min: 14, emoji: '🚀', key: 'streak_unstoppable', label: 'Unstoppable', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', bar: 'bg-rose-500', glow: true },
  { min: 7, emoji: '🔥', key: 'streak_onFire', label: 'On Fire', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', bar: 'bg-orange-500', glow: true },
  { min: 3, emoji: '⚡', key: 'streak_heatingUp', label: 'Heating Up', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', bar: 'bg-amber-500', glow: false },
  { min: 1, emoji: '🌱', key: 'streak_started', label: 'Streak Started', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', bar: 'bg-emerald-500', glow: false },
  { min: 0, emoji: '💤', key: 'streak_none', label: 'No Streak Yet', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', bar: 'bg-slate-400', glow: false },
];

export function streakTier(current) {
  return STREAK_TIERS.find((tier) => Number(current || 0) >= tier.min) ?? STREAK_TIERS[STREAK_TIERS.length - 1];
}

// Goal standing: same idea for the monthly target, judged against the
// pace-adjusted expectation rather than the flat goal.
export function goalTier(pct, expectedPct) {
  if (pct >= 100) return { key: 'goal_smashed', emoji: '🏆', label: 'Goal Smashed', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', bar: 'bg-yellow-400' };
  if (pct >= expectedPct) return { key: 'goal_ahead', emoji: '🚀', label: 'Ahead Of Pace', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', bar: 'bg-emerald-500' };
  if (pct >= expectedPct * 0.75) return { key: 'goal_onTrack', emoji: '⚡', label: 'On Track', color: 'text-brand-primary', bg: 'bg-brand-primary/10', border: 'border-brand-primary/20', bar: 'bg-brand-primary' };
  // The two below are the ones a salesperson reads on a bad month, so they name
  // the way back rather than the shortfall.
  if (pct >= expectedPct * 0.5) return { key: 'goal_catchingUp', behind: true, emoji: '⏳', label: 'Catching Up', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', bar: 'bg-amber-500' };
  return { key: 'goal_comeback', behind: true, emoji: '💪', label: 'Comeback Zone', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', bar: 'bg-rose-500' };
}

// Where the month lands at the current daily rate, and what each remaining day
// needs to reach `target`. On the last day there is no day left to spread the
// gap over, so today carries all of it.
export function projectMonth({ value, target, dayOfMonth, daysInMonth }) {
  const v = Number(value || 0);
  const goal = Number(target || 0);
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const perDaySoFar = dayOfMonth > 0 ? v / dayOfMonth : 0;
  const projected = perDaySoFar * daysInMonth;
  const remaining = Math.max(0, goal - v);
  return {
    daysLeft,
    remaining,
    perDaySoFar,
    projected,
    projectedPct: goal > 0 ? (projected / goal) * 100 : 0,
    perDayNeeded: remaining / Math.max(daysLeft, 1),
  };
}
