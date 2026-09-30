'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AUTO_CLOSED_NOTE } from '@/lib/attendance.mjs';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';

// Entries cross the wire as IST wall-clock "YYYY-MM-DDTHH:MM:SS" (see
// serializeEntry), which is exactly what <input type="datetime-local"> wants
// minus the seconds — no Date parsing, so no browser timezone in the way.
const toInput = (value) => (value ? String(value).slice(0, 16) : '');

function draftFrom(entry) {
  return {
    userId: entry ? String(entry.user_id) : '',
    clockInAt: toInput(entry?.clock_in_at),
    clockOutAt: toInput(entry?.clock_out_at),
    breakMinutes: entry ? String(Math.round((entry.break_seconds || 0) / 60)) : '0',
    note: entry?.note || '',
  };
}

/**
 * Manager correction of one attendance entry, or a new manual one when `entry`
 * is null. Drives the existing PATCH/DELETE /api/stock/attendance/[id] and
 * POST /api/stock/attendance routes; every save stamps edited_by server-side,
 * which is also what clears an auto-closed punch from "Needs review".
 */
export function AttendanceEntrySheet({ open, entry = null, employees = [], onClose, onSaved }) {
  const isNew = !entry;
  const [draft, setDraft] = useState(() => draftFrom(entry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(draftFrom(entry));
      setError('');
    }
  }, [open, entry]);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function send(url, method, body) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (isNew) {
      send('/api/stock/attendance', 'POST', {
        userId: Number(draft.userId),
        workDate: draft.clockInAt.slice(0, 10),
        clockInAt: draft.clockInAt,
        clockOutAt: draft.clockOutAt,
        breakMinutes: Number(draft.breakMinutes || 0),
        note: draft.note || null,
      });
      return;
    }

    // Only what changed: resending an untouched break would round its seconds
    // to whole minutes, and an untouched note would drop nothing but still count.
    const initial = draftFrom(entry);
    const body = {};
    if (draft.clockInAt !== initial.clockInAt) body.clockInAt = draft.clockInAt;
    if (draft.clockOutAt !== initial.clockOutAt) body.clockOutAt = draft.clockOutAt || null;
    if (draft.breakMinutes !== initial.breakMinutes) body.breakMinutes = Number(draft.breakMinutes || 0);
    if (draft.note !== initial.note) body.note = draft.note;
    // Saving an auto-closed punch untouched is how a manager signs it off.
    if (!Object.keys(body).length) body.note = draft.note;
    send(`/api/stock/attendance/${entry.id}`, 'PATCH', body);
  }

  function remove() {
    if (!window.confirm('Remove this attendance entry? It will no longer count toward payroll.')) return;
    send(`/api/stock/attendance/${entry.id}`, 'DELETE');
  }

  const autoClosed = String(entry?.note || '').includes(AUTO_CLOSED_NOTE);
  // Clock-in stays on its work date: PATCH does not move work_date.
  const dayBounds = entry
    ? { min: `${entry.work_date}T00:00`, max: `${entry.work_date}T23:59` }
    : {};

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose?.() : null)}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-white dark:bg-slate-950 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isNew ? 'Add attendance entry' : `${entry.user_name} · ${entry.work_date}`}</SheetTitle>
          <SheetDescription>
            {isNew
              ? 'For someone who could not punch. The shift must have a clock-out.'
              : autoClosed
                ? 'Closed automatically at shift end because nobody clocked out. Set the real clock-out time, or save as-is to confirm it.'
                : 'Correct the times, break or note. Your name is recorded on the change.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {isNew ? (
            <div>
              <label className={FORM_LABEL_CLASS} htmlFor="entry-employee">Employee</label>
              <select id="entry-employee" required value={draft.userId} onChange={set('userId')} className={FORM_INPUT_CLASS}>
                <option value="">Select…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="entry-in">Clock in</label>
            <input
              id="entry-in"
              type="datetime-local"
              required
              value={draft.clockInAt}
              onChange={set('clockInAt')}
              {...dayBounds}
              className={FORM_INPUT_CLASS}
            />
          </div>

          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="entry-out">Clock out</label>
            <input
              id="entry-out"
              type="datetime-local"
              required={isNew}
              min={draft.clockInAt || undefined}
              value={draft.clockOutAt}
              onChange={set('clockOutAt')}
              className={FORM_INPUT_CLASS}
            />
          </div>

          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="entry-break">Break (minutes)</label>
            <input
              id="entry-break"
              type="number"
              min="0"
              inputMode="numeric"
              value={draft.breakMinutes}
              onChange={set('breakMinutes')}
              className={FORM_INPUT_CLASS}
            />
          </div>

          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="entry-note">Note</label>
            <input id="entry-note" value={draft.note} onChange={set('note')} placeholder="Optional" className={FORM_INPUT_CLASS} />
          </div>

          <p role="alert" className="text-xs font-bold text-rose-500 empty:hidden">{error}</p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {!isNew ? (
              <button type="button" onClick={remove} disabled={saving} className={`${PILL_BUTTON_CLASS} text-rose-600 dark:text-rose-400`}>
                <Trash2 />
                Remove
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={saving} className={PILL_BUTTON_CLASS}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={PILL_PRIMARY_BUTTON_CLASS}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
