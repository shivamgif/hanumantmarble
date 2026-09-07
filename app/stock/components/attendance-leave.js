'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { CLASSES, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';

const LEAVE_TYPES = ['paid', 'unpaid', 'sick', 'casual'];

const STATUS_STYLE = {
  pending: 'bg-amber-500/10 text-amber-600',
  approved: 'bg-emerald-500/10 text-emerald-600',
  rejected: 'bg-rose-500/10 text-rose-600',
};

export function AttendanceLeave({ canManage = false, employees = [] }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ userId: '', fromDate: '', toDate: '', leaveType: 'paid', reason: '' });

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = canManage ? '?scope=all' : '';
    fetch(`/api/stock/attendance/leave${params}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load leave requests');
        return json;
      })
      .then((json) => setRequests(json.leaveRequests || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [canManage]);

  useEffect(load, [load]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/stock/attendance/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, userId: form.userId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit');
      setForm({ userId: '', fromDate: '', toDate: '', leaveType: 'paid', reason: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function decide(id, status) {
    setError('');
    try {
      const res = await fetch(`/api/stock/attendance/leave/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className={CLASSES.card}>
        <h2 className={CLASSES.title}>{canManage ? 'Record leave' : 'Request leave'}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {canManage ? (
            <div>
              <label className={FORM_LABEL_CLASS} htmlFor="leave-employee">Employee</label>
              <select
                id="leave-employee"
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                className={FORM_INPUT_CLASS}
              >
                <option value="">Myself</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="leave-from">From</label>
            {/* Native date input: no picker library needed, and it is the
                better mobile experience on the phones staff actually use. */}
            <input
              id="leave-from"
              type="date"
              required
              value={form.fromDate}
              onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
              className={FORM_INPUT_CLASS}
            />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="leave-to">To</label>
            <input
              id="leave-to"
              type="date"
              required
              min={form.fromDate || undefined}
              value={form.toDate}
              onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
              className={FORM_INPUT_CLASS}
            />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="leave-type">Type</label>
            <select
              id="leave-type"
              value={form.leaveType}
              onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}
              className={FORM_INPUT_CLASS}
            >
              {LEAVE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="leave-reason">Reason</label>
            <input
              id="leave-reason"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className={FORM_INPUT_CLASS}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={saving} className={PILL_PRIMARY_BUTTON_CLASS}>
            {saving ? 'Saving…' : 'Submit'}
          </button>
        </div>
        {error ? <p className="mt-3 text-xs font-bold text-rose-500">{error}</p> : null}
      </form>

      <div className={CLASSES.card}>
        <h2 className={CLASSES.title}>{canManage ? 'All requests' : 'My requests'}</h2>
        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="py-8 text-center text-xs font-bold text-slate-400">Loading…</p>
          ) : !requests.length ? (
            <p className="py-8 text-center text-xs font-bold text-slate-400">No leave requests yet.</p>
          ) : (
            requests.map((req) => (
              <article
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
              >
                <div>
                  <p className="text-xs font-black">
                    {req.user_name}
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{req.leave_type}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-500">
                    {req.from_date} → {req.to_date}
                    {req.reason ? ` · ${req.reason}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      STATUS_STYLE[req.status] || STATUS_STYLE.pending
                    }`}
                  >
                    {req.status}
                  </span>
                  {canManage && req.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => decide(req.id, 'approved')}
                        className="rounded-full bg-emerald-500/10 p-1.5 text-emerald-600 transition hover:bg-emerald-500/20"
                        aria-label={`Approve leave for ${req.user_name}`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(req.id, 'rejected')}
                        className="rounded-full bg-rose-500/10 p-1.5 text-rose-600 transition hover:bg-rose-500/20"
                        aria-label={`Reject leave for ${req.user_name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
