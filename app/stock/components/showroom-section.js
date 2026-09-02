'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Store, Undo2, Replace } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { showroomSplit } from '@/lib/stock-showroom';
import {
  FORM_INPUT_CLASS, FORM_LABEL_CLASS, formatDateTime,
  SHOWROOM_ACTIONS, showroomActionOf, formatShowroomQty, invalidateShipmentCache,
} from '../lib/stock-utils';

const WRITE_ROLES = ['admin', 'manager', 'stock_maintainer'];

// Two moves, not three. Whether display stock is on a cassette or stuck down as
// flooring is a STATE, picked with a radio and changeable afterwards, so it is
// not its own button — see lib/stock-showroom.js.
const ACTIONS = [
  { action: 'to_showroom', label: 'Send to showroom', icon: Store, className: 'bg-violet-500 hover:bg-violet-600' },
  { action: 'to_warehouse', label: 'Bring back', icon: Undo2, className: 'bg-emerald-500 hover:bg-emerald-600' },
  { action: 'reclassify', label: 'Change state', icon: Replace, className: 'bg-slate-600 hover:bg-slate-700' },
];

const STATE_LABELS = {
  cassette: { title: 'On a cassette', hint: 'On display, can be brought back and sold.' },
  installed: { title: 'Installed as flooring', hint: 'Stuck down. Not sellable until re-marked.' },
};

function StateRadio({ value, onChange, name, disabledStates = [] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(STATE_LABELS).map(([state, { title, hint }]) => {
        const disabled = disabledStates.includes(state);
        return (
          <label
            key={state}
            className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors ${
              disabled
                ? 'cursor-not-allowed border-border/40 opacity-40'
                : value === state
                  ? 'cursor-pointer border-brand-primary/60 bg-brand-primary/5'
                  : 'cursor-pointer border-border/60 hover:bg-muted/40'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={state}
              checked={value === state}
              disabled={disabled}
              onChange={() => onChange(state)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-primary"
            />
            <div className="space-y-0.5">
              <div className="text-xs font-black uppercase tracking-widest text-foreground/80">{title}</div>
              <p className="text-[11px] font-medium text-muted-foreground">{hint}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Move an item between the warehouse and the showroom, set or correct whether
 * showroom stock is on a cassette or installed, and show that item's history.
 * Lives inside the stock item preview sheet, which already opens on a row click
 * — so the item is implicit and this is a quantity + state form.
 */
export function ShowroomSection({ item, userRole, onChanged }) {
  const canWrite = WRITE_ROLES.includes(userRole);
  const isStone = item?.unit_of_measure === 'sqft';
  const split = useMemo(() => showroomSplit(item), [item]);

  const [openAction, setOpenAction] = useState(null);
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState('cassette');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const itemId = item?.id;

  const loadHistory = useCallback(async () => {
    if (!itemId) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/stock/movements?itemId=${itemId}&limit=10`);
      const json = await response.json();
      setHistory(response.ok ? (json.movements || []) : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [itemId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const reset = useCallback(() => {
    setOpenAction(null);
    setQty('');
    setNotes('');
    setState('cassette');
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/stock/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action: openAction, state, qty, notes }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to record the move.');
      reset();
      // The stock counters just changed, so the cached item list is stale.
      invalidateShipmentCache();
      await loadHistory();
      onChanged?.();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }, [itemId, openAction, state, qty, notes, reset, loadHistory, onChanged]);

  const onSubmitClick = useCallback(() => {
    // Marking stock installed takes it out of sale until someone re-marks it,
    // so confirm — but it is reversible, unlike the old write-off.
    if (state === 'installed' && openAction !== 'to_warehouse') setConfirm(true);
    else submit();
  }, [state, openAction, submit]);

  const fmt = (n) => (isStone ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : n);

  return (
    <div className="space-y-5">
      {/* What is where, before any action — the whole point of the feature. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">At showroom</span>
        <span className="tabular-nums text-sm font-black text-slate-900 dark:text-white">
          {fmt(split.total)} <span className="text-[10px] uppercase text-slate-400">{split.unit}</span>
        </span>
        {split.total > 0 && (
          <span className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-violet-500">
              {fmt(split.cassette)} on cassette
            </span>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-500">
              {fmt(split.installed)} installed
            </span>
          </span>
        )}
      </div>

      {canWrite && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map(({ action, label, icon: Icon, className }) => (
              <button
                key={action}
                type="button"
                disabled={action !== 'to_showroom' && split.total <= 0}
                title={action !== 'to_showroom' && split.total <= 0 ? 'Nothing at the showroom yet' : undefined}
                onClick={() => {
                  if (openAction === action) return reset();
                  reset();
                  setOpenAction(action);
                  // Reclassify defaults to the state the stock is NOT in, since
                  // that is the only reason to open it.
                  if (action === 'reclassify') setState(split.installed > 0 && split.cassette <= 0 ? 'cassette' : 'installed');
                }}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${className} ${openAction === action ? 'ring-2 ring-offset-2 ring-brand-primary' : ''}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {openAction && (
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={FORM_LABEL_CLASS} htmlFor="showroom-qty">
                    {isStone ? 'Quantity (sqft)' : item?.unit_of_measure === 'bag' ? 'Quantity (bags)' : 'Quantity (boxes)'}
                  </label>
                  <input
                    id="showroom-qty"
                    type="number"
                    min="0"
                    step={isStone ? '0.001' : '1'}
                    value={qty}
                    onChange={(event) => setQty(event.target.value)}
                    className={FORM_INPUT_CLASS}
                    placeholder="0"
                    autoFocus
                  />
                </div>
                <div>
                  <label className={FORM_LABEL_CLASS} htmlFor="showroom-notes">Notes</label>
                  <input
                    id="showroom-notes"
                    type="text"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={FORM_INPUT_CLASS}
                    placeholder={state === 'installed' ? 'Where was it laid?' : 'Cassette / display spot'}
                  />
                </div>
              </div>

              {openAction !== 'to_warehouse' && (
                <div className="space-y-2">
                  <span className={FORM_LABEL_CLASS}>
                    {openAction === 'reclassify' ? 'Change state to' : 'Goes to the showroom as'}
                  </span>
                  <StateRadio
                    name="showroom-state"
                    value={state}
                    onChange={setState}
                    // Nothing to move into a state it is already entirely in.
                    disabledStates={openAction === 'reclassify'
                      ? [split.cassette <= 0 ? 'installed' : null, split.installed <= 0 ? 'cassette' : null].filter(Boolean)
                      : []}
                  />
                </div>
              )}

              {openAction === 'to_warehouse' && split.installed > 0 && (
                <p className="text-[11px] font-medium text-muted-foreground">
                  Only the {fmt(split.cassette)} {split.unit} on a cassette can come back.
                  Re-mark installed stock as “on a cassette” first if it was logged by mistake.
                </p>
              )}

              {error && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-500">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submitting || !qty}
                  onClick={onSubmitClick}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirm
                </button>
                <button type="button" onClick={reset} className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Showroom activity</div>
        {historyLoading ? (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : history.length === 0 ? (
          <div className="text-xs font-bold text-slate-400">No showroom activity.</div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/60 overflow-hidden">
            {history.map((movement) => {
              const action = showroomActionOf(movement);
              return (
                <li key={movement.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-xs bg-muted/20">
                  <span className="tabular-nums font-bold text-slate-400 w-20 shrink-0">{formatDateTime(movement.created_at)}</span>
                  <span className={`font-black uppercase tracking-widest text-[10px] ${action ? SHOWROOM_ACTIONS[action].tone : 'text-slate-500'}`}>
                    {action ? SHOWROOM_ACTIONS[action].short : movement.movement_type}
                  </span>
                  <span className="tabular-nums font-black text-slate-900 dark:text-white">{formatShowroomQty(movement)}</span>
                  <span className="font-bold text-slate-400 truncate">{movement.created_by}</span>
                  {movement.notes && <span className="text-slate-500 italic truncate">{movement.notes}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as installed?</AlertDialogTitle>
            <AlertDialogDescription>
              {qty || 0} {isStone ? 'sqft' : `${split.unit}`} of {item?.sku} will be recorded as laid as
              flooring, and will not count as sellable stock. You can change it back to “on a cassette”
              later if it turns out to be wrong.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirm(false); submit(); }}>
              Mark installed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ShowroomSection;
