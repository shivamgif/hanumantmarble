'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageUp, Save, Trash2 } from 'lucide-react';
import { CLASSES, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';
import { CompanyMark } from '@/components/ui/brand-mark';

const MAX_KB = 300;

/**
 * Settings → Company: the name and logo every screen and printed invoice shows.
 * Legal details (GSTIN, address, bank) belong to each business, under GST &
 * branches. Saving reloads the page so the header picks the change up.
 */
export function CompanyPanel() {
  const [company, setCompany] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });
  const fileRef = useRef(null);

  useEffect(() => {
    fetch('/api/stock/company', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load company');
        setCompany(json.company);
        setName(json.company?.name || '');
        setCanManage(Boolean(json.canManage));
      })
      .catch((err) => setState({ busy: false, error: err.message }));
  }, []);

  async function send(url, options) {
    setState({ busy: true, error: '' });
    try {
      const res = await fetch(url, options);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      window.location.reload();
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }

  function upload(file) {
    if (!file) return;
    if (file.size > MAX_KB * 1000) {
      setState({ busy: false, error: `The logo must be at most ${MAX_KB} KB.` });
      return;
    }
    send('/api/stock/company/logo', { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  }

  if (!company) {
    return <div className={CLASSES.card}>{state.error ? <p className="text-sm text-rose-500">{state.error}</p> : <p className="text-sm text-muted-foreground">Loading…</p>}</div>;
  }

  return (
    <div className={CLASSES.card}>
      <h2 className={CLASSES.title}>Company</h2>
      <p className="mt-1 text-[11px] font-bold text-slate-500">
        Shown in the app header for everyone on your staff, and on printed invoices.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send('/api/stock/company', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <label className={FORM_LABEL_CLASS} htmlFor="company-name">Company name</label>
          <input id="company-name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={FORM_INPUT_CLASS} disabled={!canManage} />
        </div>
        {canManage ? (
          <button type="submit" disabled={state.busy || name.trim() === company.name} className={PILL_PRIMARY_BUTTON_CLASS}>
            <Save className="h-3.5 w-3.5" /> Save name
          </button>
        ) : null}
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <CompanyMark name={company.name} logo={company.logo} logoDark={company.logoDark} size={64} />
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-500">
            Logo: PNG, JPEG or WebP, at most {MAX_KB} KB. A square image looks best. Without one, your initials are shown.
          </p>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
              <button type="button" disabled={state.busy} onClick={() => fileRef.current?.click()} className={PILL_BUTTON_CLASS}>
                <ImageUp className="h-3.5 w-3.5" /> {company.hasUploadedLogo ? 'Replace logo' : 'Upload logo'}
              </button>
              {company.hasUploadedLogo ? (
                <button type="button" disabled={state.busy} onClick={() => send('/api/stock/company/logo', { method: 'DELETE' })} className={PILL_BUTTON_CLASS}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Fixed by the app today; shown so nobody hunts for a setting that does not exist yet. */}
      <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Financial year</dt><dd>April to March</dd></div>
        <div><dt className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Time zone</dt><dd>India (IST)</dd></div>
        <div><dt className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Currency</dt><dd>Indian rupee (₹)</dd></div>
      </dl>

      {state.error ? <p className="mt-3 text-[11px] font-bold text-rose-600">{state.error}</p> : null}
      {!canManage ? <p className="mt-3 text-[11px] font-bold text-slate-500">Only a manager can change these.</p> : null}
    </div>
  );
}
