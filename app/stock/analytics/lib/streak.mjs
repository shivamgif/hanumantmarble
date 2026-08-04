// Sales streak derived from the days a salesperson actually dispatched.
// Plain module (no React) so scripts/check-streak.mjs can assert on it.
//
// `activeDays` is the ISO date list (YYYY-MM-DD, already shifted to Asia/Kolkata)
// from /api/stock/salesperson-analytics; `today` is that same date for "now".

const DAY_MS = 86400000;

const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const toMs = (key) => Date.parse(`${key}T00:00:00Z`);

export function deriveStreak(activeDays, today) {
  const days = [...new Set((activeDays || []).filter(Boolean).map(String))].sort();
  const set = new Set(days);
  const todayKey = today || toKey(Date.now());
  const todayMs = toMs(todayKey);

  // ponytail: best run is only the best inside the fetched window (120 days).
  // Widen the API interval if an all-time record is ever wanted.
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev !== null && toMs(d) - toMs(prev) === DAY_MS ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }

  // Count back from today. A quiet today must not break the streak - the day
  // isn't over yet - so the run is allowed to end on yesterday instead.
  let cursor = set.has(todayKey) ? todayMs : todayMs - DAY_MS;
  let current = 0;
  while (set.has(toKey(cursor))) {
    current += 1;
    cursor -= DAY_MS;
  }

  const month = todayKey.slice(0, 7);
  return {
    current,
    best: Math.max(best, current),
    activeToday: set.has(todayKey),
    activeThisMonth: days.filter((d) => d.startsWith(month)).length,
    // Last 7 days oldest-first, for the dot row on the streak card.
    last7: Array.from({ length: 7 }, (_, i) => {
      const key = toKey(todayMs - (6 - i) * DAY_MS);
      return { date: key, active: set.has(key) };
    }),
  };
}

// Tier ladder: drives the emoji, copy and colour of the streak card.
// Ordered high -> low; first match wins.
export const STREAK_TIERS = [
  { min: 14, emoji: '🚀', label: 'Unstoppable', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', bar: 'bg-rose-500', glow: true },
  { min: 7, emoji: '🔥', label: 'On Fire', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', bar: 'bg-orange-500', glow: true },
  { min: 3, emoji: '⚡', label: 'Heating Up', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', bar: 'bg-amber-500', glow: false },
  { min: 1, emoji: '🌱', label: 'Streak Started', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', bar: 'bg-emerald-500', glow: false },
  { min: 0, emoji: '💤', label: 'No Streak Yet', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', bar: 'bg-slate-400', glow: false },
];

export function streakTier(current) {
  return STREAK_TIERS.find((tier) => Number(current || 0) >= tier.min) ?? STREAK_TIERS[STREAK_TIERS.length - 1];
}

// Goal standing: same idea for the monthly target, judged against the
// pace-adjusted expectation rather than the flat goal.
export function goalTier(pct, expectedPct) {
  if (pct >= 100) return { emoji: '🏆', label: 'Goal Smashed', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', bar: 'bg-yellow-400' };
  if (pct >= expectedPct) return { emoji: '🚀', label: 'Ahead Of Pace', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', bar: 'bg-emerald-500' };
  if (pct >= expectedPct * 0.75) return { emoji: '⚡', label: 'On Track', color: 'text-brand-primary', bg: 'bg-brand-primary/10', border: 'border-brand-primary/20', bar: 'bg-brand-primary' };
  if (pct >= expectedPct * 0.5) return { emoji: '🐢', label: 'Behind Pace', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', bar: 'bg-amber-500' };
  return { emoji: '🆘', label: 'Needs A Push', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', bar: 'bg-rose-500' };
}
