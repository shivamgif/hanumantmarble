// Rows of a date-sorted list, bunched by calendar day so the date is printed once
// per day instead of once per row. Only consecutive rows merge, so the caller's
// sort order is kept exactly.

// A bare DATE ('2026-09-30') is a calendar day, not UTC midnight: parse it local,
// or it lands on the previous day anywhere west of UTC.
function toDate(value) {
  if (value == null || value === '') return new Date(NaN); // new Date(null) is 1970
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// -> [{ key, label, rows }]. label is Today / Yesterday / "Mon, 29 Sep", with the
// year added only when it isn't the current one.
export function groupRowsByDay(rows, dateOf, { today = 'Today', yesterday = 'Yesterday', locale = 'en-IN', now = new Date() } = {}) {
  const todayKey = dayKey(now);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const yesterdayKey = dayKey(yest);

  const groups = [];
  for (const row of rows) {
    const d = toDate(dateOf(row));
    const valid = !Number.isNaN(d.getTime());
    const key = valid ? dayKey(d) : 'unknown';
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const label = !valid ? '—'
        : key === todayKey ? today
          : key === yesterdayKey ? yesterday
            : d.toLocaleDateString(locale, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
            });
      group = { key, label, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

export function formatTime(value, locale = 'en-IN') {
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}
