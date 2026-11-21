'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { CLASSES, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';
import { SelectField } from '@/components/ui/select';
import { GST_UQC_CODES } from '@/lib/gst-invoice.mjs';

/**
 * Item types and the unit each is sold in. Counted goods can be given their
 * own unit (roll, drum, pcs) and GST unit code; invoices, e-invoices and e-way
 * bills print it. Blank keeps "bag" / BAG. Issued invoices keep the unit they
 * were issued with.
 */
const FIXED_UNIT = { tile: 'Boxes / pieces (BOX, PCS)', stone: 'Square feet (SQF)' };

function CountedTypeRow({ type, canManage, onSaved }) {
  const [form, setForm] = useState({ unitLabel: type.unitLabel || '', uqc: type.uqc || '' });
  const [state, setState] = useState({ saving: false, error: '' });
  const dirty = form.unitLabel !== (type.unitLabel || '') || form.uqc !== (type.uqc || '');

  async function save(event) {
    event.preventDefault();
    setState({ saving: true, error: '' });
    try {
      const res = await fetch('/api/stock/item-types', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: type.id, ...form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      onSaved(json.type);
      setState({ saving: false, error: '' });
    } catch (error) {
      setState({ saving: false, error: error.message });
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 p-3">
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-semibold text-foreground">{type.name}</p>
        <p className="text-[11px] font-bold text-slate-500">{type.itemCount} item{type.itemCount === 1 ? '' : 's'}</p>
      </div>
      <div className="w-32">
        <label className={FORM_LABEL_CLASS} htmlFor={`type-${type.id}-unit`}>Unit name</label>
        <input
          id={`type-${type.id}-unit`}
          maxLength={12}
          value={form.unitLabel}
          onChange={(e) => setForm((f) => ({ ...f, unitLabel: e.target.value }))}
          className={FORM_INPUT_CLASS}
          placeholder="bag"
          disabled={!canManage}
        />
      </div>
      <div className="w-56">
        <label className={FORM_LABEL_CLASS} htmlFor={`type-${type.id}-uqc`}>GST unit code</label>
        <SelectField
          id={`type-${type.id}-uqc`}
          value={form.uqc}
          onChange={(e) => setForm((f) => ({ ...f, uqc: e.target.value }))}
          className={FORM_INPUT_CLASS}
          disabled={!canManage}
        >
          <option value="">BAG · Bags (default)</option>
          {Object.entries(GST_UQC_CODES).map(([code, label]) => (
            <option key={code} value={code}>{code} · {label}</option>
          ))}
        </SelectField>
      </div>
      {canManage ? (
        <button type="submit" disabled={!dirty || state.saving} className={PILL_PRIMARY_BUTTON_CLASS}>
          <Save className="h-3.5 w-3.5" />
          {state.saving ? 'Saving…' : 'Save'}
        </button>
      ) : null}
      {state.error ? <p className="w-full text-[11px] font-bold text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function ItemTypesPanel() {
  const [types, setTypes] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetch('/api/stock/item-types', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load item types');
        setTypes(json.types || []);
        setCanManage(Boolean(json.canManage));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const counted = (types || []).filter((t) => t.category === 'bag');
  const fixed = (types || []).filter((t) => t.category !== 'bag');

  return (
    <div className={CLASSES.card}>
      <h2 className={CLASSES.title}>Item types &amp; units</h2>
      <p className="mt-1 text-[11px] font-bold text-slate-500">
        Counted goods can be sold in their own unit (roll, drum, pcs). Invoices, e-invoices and e-way bills print that
        unit and its GST code. Leave blank to keep &ldquo;bag&rdquo;. Quantities stay whole numbers, and invoices already
        issued keep the unit they were issued with.
      </p>
      {error ? <p className="mt-3 text-[11px] font-bold text-red-600">{error}</p> : null}
      {types === null && !error ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : null}

      {counted.length ? (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Counted goods</h3>
          {counted.map((type) => (
            <CountedTypeRow
              key={type.id}
              type={type}
              canManage={canManage}
              onSaved={(saved) => setTypes((all) => all.map((t) => (t.id === saved.id ? saved : t)))}
            />
          ))}
        </div>
      ) : null}

      {fixed.length ? (
        <div className="mt-4 space-y-1">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Built-in units</h3>
          {fixed.map((type) => (
            <p key={type.id} className="flex justify-between gap-3 text-sm">
              <span className="text-foreground">{type.name}</span>
              <span className="text-muted-foreground">{FIXED_UNIT[type.category]}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
