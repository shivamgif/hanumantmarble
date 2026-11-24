'use client';
import { SelectField } from '@/components/ui/select';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Ban, Check, ChevronDown, ChevronRight, Download, MessageCircle, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { istToday } from '@/lib/attendance.mjs';
import { AGE_BUCKETS, GROUPS, PARTY_GROUPS, VOUCHER_TYPES } from '@/lib/accounts.mjs';
import { toCsv } from '@/lib/gst-returns.mjs';
import { TDS_SECTIONS } from '@/lib/tds.mjs';
import { GST_STATES } from '@/lib/gst-invoice.mjs';
import { CLASSES, ERROR_BOX_CLASS, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';
import { formatRupees } from './invoice-form';
import { BillAllocator, drCr } from './voucher-form';

async function readJson(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.error || 'Request failed'), { details: json.details });
  return json;
}

/** Fetch JSON for a URL, refetching whenever the URL or `refreshKey` changes. */
function useJson(url, refreshKey) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetch(url, { cache: 'no-store' }).then(readJson)
      .then((data) => !cancelled && setState({ data, error: '', loading: false }))
      .catch((err) => !cancelled && setState({ data: null, error: err.message, loading: false }));
    return () => { cancelled = true; };
  }, [url, refreshKey]);
  return state;
}

const STATUS_TONE = {
  draft: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  posted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-slate-500/10 text-slate-500 line-through',
};

const monthStart = () => `${istToday().slice(0, 8)}01`;

function Empty({ state, t }) {
  if (state.loading) return <div className="space-y-2 py-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-10 skeleton rounded-lg" />)}</div>;
  if (state.error) return <p role="alert" className={ERROR_BOX_CLASS}>{state.error}</p>;
  return <p className="py-8 text-center text-sm text-slate-400">{t('nothingHere')}</p>;
}

/** Lines of one voucher, loaded on expand. */
function VoucherLines({ id, t }) {
  const state = useJson(`/api/stock/accounts/vouchers/${id}`, 0);
  if (!state.data) return <Empty state={state} t={t} />;
  return (
    <table className="w-full text-xs">
      <tbody>
        {state.data.lines.map((line) => (
          <tr key={line.id} className="border-t border-border/50">
            <td className="py-1 pr-2">{line.ledger_name} <span className="text-slate-400">{line.group_name}</span></td>
            <td className="py-1 pr-2 text-slate-500">{line.bill_ref ? `${line.bill_ref_type}: ${line.bill_ref}` : line.bill_ref_type || ''}</td>
            <td className="py-1 text-right tabular-nums">{drCr(line.amount, t)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Day book. Approvers post others' drafts (settling receipts/payments against
 * bills first), discard drafts and cancel manual entries.
 */
export function DayBookPanel({ business, role, me, isApprover, refreshKey, onChanged, notify, t }) {
  const [filters, setFilters] = useState({ from: monthStart(), to: istToday(), type: '', status: '' });
  const [expanded, setExpanded] = useState(null);
  const [settling, setSettling] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const query = new URLSearchParams({ businessId: business.id, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
  const state = useJson(`/api/stock/accounts/vouchers?${query}`, refreshKey);

  const act = useCallback(async (voucher, action, extra = {}) => {
    try {
      const json = await readJson(await fetch(`/api/stock/accounts/vouchers/${voucher.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      }));
      notify({ type: 'success', message: action === 'post' ? t('postedOk', { number: json.voucher.voucher_number }) : t(action === 'discard' ? 'discard' : 'cancelled') });
      setSettling(null);
      onChanged();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    }
  }, [notify, onChanged, t]);

  const vouchers = state.data?.vouchers || [];
  return (
    <section className="glass-panel overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-end gap-2 border-b border-border p-3">
        {['from', 'to'].map((key) => (
          <label key={key} className="text-xs">
            <span className={FORM_LABEL_CLASS}>{t(key)}</span>
            <input type="date" value={filters[key]} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))} className={`${FORM_INPUT_CLASS} w-40`} />
          </label>
        ))}
        <label className="text-xs">
          <span className={FORM_LABEL_CLASS}>{t('type')}</span>
          <SelectField value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className={`${FORM_INPUT_CLASS} w-40`}>
            <option value="">{t('all')}</option>
            {Object.keys(VOUCHER_TYPES).map((type) => <option key={type} value={type}>{t(type)}</option>)}
          </SelectField>
        </label>
        <label className="text-xs">
          <span className={FORM_LABEL_CLASS}>{t('status')}</span>
          <SelectField value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={`${FORM_INPUT_CLASS} w-36`}>
            <option value="">{t('all')}</option>
            {['draft', 'posted', 'cancelled'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </SelectField>
        </label>
      </div>
      {!vouchers.length ? <Empty state={state} t={t} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-slate-500">
              <tr>
                <th className="w-8" /><th className="px-2 py-2">{t('date')}</th><th className="px-2">{t('number')}</th><th className="px-2">{t('type')}</th>
                <th className="px-2">{t('party')}</th><th className="px-2 text-right">{t('amount')}</th><th className="px-2">{t('status')}</th><th className="px-2" />
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => {
                const mine = Number(v.created_by_user_id) === Number(me);
                return (
                  <Fragment key={v.id}>
                    <tr className="border-t border-border">
                      <td className="pl-2">
                        <button type="button" aria-label={t('view')} onClick={() => setExpanded(expanded === v.id ? null : v.id)} className="p-1 text-slate-400">
                          {expanded === v.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-2 py-2 tabular-nums">{v.voucher_date}</td>
                      <td className="px-2">{v.voucher_number || '—'}</td>
                      <td className="px-2">{t(v.voucher_type)}</td>
                      <td className="px-2">
                        {v.party_name || '—'}
                        {v.narration ? <span className="block max-w-xs truncate text-xs text-slate-500">{v.narration}</span> : null}
                      </td>
                      <td className="px-2 text-right tabular-nums">{formatRupees(v.amount)}</td>
                      <td className="px-2"><span className={`rounded-md px-2 py-0.5 text-xs ${STATUS_TONE[v.status]}`}>{t(v.status)}</span></td>
                      <td className="px-2 py-1">
                        <div className="flex justify-end gap-1">
                          {v.status === 'draft' && isApprover && !mine ? (
                            <button type="button" className={PILL_PRIMARY_BUTTON_CLASS}
                              onClick={() => (['receipt', 'payment'].includes(v.voucher_type) && v.party_name ? (setAllocations([]), setSettling(v)) : act(v, 'post'))}>
                              <Check className="h-3.5 w-3.5" /> {t('post')}
                            </button>
                          ) : null}
                          {v.status === 'draft' && (mine || isApprover) ? (
                            <button type="button" className={PILL_BUTTON_CLASS} onClick={() => act(v, 'discard')}><Trash2 className="h-3.5 w-3.5" /></button>
                          ) : null}
                          {v.status === 'posted' && isApprover && !v.source_table ? (
                            <button type="button" className={PILL_BUTTON_CLASS} onClick={() => act(v, 'cancel')}><Ban className="h-3.5 w-3.5" /> {t('cancel')}</button>
                          ) : null}
                        </div>
                        {v.status === 'draft' && isApprover && mine ? <p className="text-right text-[10px] text-slate-400">{t('ownDraft')}</p> : null}
                      </td>
                    </tr>
                    {expanded === v.id ? (
                      <tr><td /><td colSpan={7} className="px-2 pb-3"><VoucherLines id={v.id} t={t} /></td></tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={Boolean(settling)} onOpenChange={(o) => !o && setSettling(null)}>
        <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[520px]">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle className="text-base">{settling ? `${t(settling.voucher_type)} · ${settling.party_name} · ${formatRupees(settling.amount)}` : ''}</SheetTitle>
          </SheetHeader>
          {settling ? (
            <div className="mt-4 space-y-4">
              <SettleForDraft voucher={settling} business={business} value={allocations} onChange={setAllocations} t={t} />
              <button type="button" className={PILL_PRIMARY_BUTTON_CLASS} onClick={() => act(settling, 'post', { allocations })}>
                <Check className="h-3.5 w-3.5" /> {t('post')}
              </button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

/** The draft's party is on its voucher; BillAllocator needs the ledger id from its lines. */
function SettleForDraft({ voucher, business, value, onChange, t }) {
  const state = useJson(`/api/stock/accounts/vouchers/${voucher.id}`, 0);
  if (!state.data) return <Empty state={state} t={t} />;
  return (
    <BillAllocator businessId={business.id} ledgerId={state.data.voucher.party_ledger_id} kind={voucher.voucher_type}
      amount={Number(voucher.amount)} value={value} onChange={onChange} t={t} />
  );
}

/** Receivables / payables with ageing, bill detail and a WhatsApp reminder. */
export function OutstandingPanel({ business, refreshKey, t }) {
  const [kind, setKind] = useState('receivable');
  const [open, setOpen] = useState(null);
  const state = useJson(`/api/stock/accounts/outstanding?businessId=${business.id}&kind=${kind}`, refreshKey);
  const data = state.data;

  const reminder = (party) => {
    const bills = party.bills.map((b) => `${b.billRef} (${b.billDate}): ${formatRupees(b.amount)}`).join('\n');
    const text = t('reminderText', { name: party.name, amount: party.total.toLocaleString('en-IN', { minimumFractionDigits: 2 }), bills, business: business.legal_name });
    const phone = String(party.phone || '').replace(/\D/g, '').replace(/^(?=\d{10}$)/, '91');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {['receivable', 'payable'].map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={kind === k ? PILL_PRIMARY_BUTTON_CLASS : PILL_BUTTON_CLASS}>{t(k)}</button>
        ))}
      </div>
      {data ? (
        <div className={CLASSES.statGrid}>
          {AGE_BUCKETS.map((bucket) => (
            <div key={bucket} className={CLASSES.statCard}>
              <p className={CLASSES.statLabel}>{bucket === 'current' ? t('current') : `${bucket} ${t('daysOverdue')}`}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatRupees(data.totals[bucket])}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="glass-panel overflow-hidden rounded-xl">
        {!data?.parties.length ? <Empty state={state} t={t} /> : (
          <ul className="divide-y divide-border">
            {data.parties.map((party) => (
              <li key={party.ledgerId} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="flex min-w-[12rem] flex-1 items-center gap-1 text-left font-semibold" onClick={() => setOpen(open === party.ledgerId ? null : party.ledgerId)}>
                    {open === party.ledgerId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {party.name}
                    {party.creditLimit > 0 && party.total > party.creditLimit ? <span className="ml-2 rounded bg-rose-500/10 px-1.5 text-xs text-rose-700">{t('creditLimit')}</span> : null}
                  </button>
                  <span className="text-xs text-slate-500">
                    {AGE_BUCKETS.filter((b) => b !== 'current' && party.buckets[b]).map((b) => `${b}: ${formatRupees(party.buckets[b])}`).join(' · ')}
                  </span>
                  <span className="font-semibold tabular-nums">{formatRupees(party.total)}</span>
                  <Link href={`/stock/accounts/ledger/${party.ledgerId}`} className={PILL_BUTTON_CLASS}>{t('statement')}</Link>
                  {kind === 'receivable' && party.phone && party.total > 0 ? (
                    <a href={reminder(party)} target="_blank" rel="noreferrer" className={PILL_BUTTON_CLASS}>
                      <MessageCircle className="h-3.5 w-3.5" /> {t('remind')}
                    </a>
                  ) : null}
                </div>
                {open === party.ledgerId ? (
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {party.bills.map((bill) => (
                        <tr key={bill.billRef} className="border-t border-border/50">
                          <td className="py-1">{bill.billRef}</td>
                          <td>{bill.billDate}</td>
                          <td>{t('due')} {bill.dueDate}</td>
                          <td className={bill.daysPastDue > 0 ? 'text-rose-600' : 'text-slate-500'}>{bill.daysPastDue > 0 ? `${bill.daysPastDue} ${t('daysOverdue')}` : t('current')}</td>
                          <td className="text-right tabular-nums">{formatRupees(bill.amount)}</td>
                        </tr>
                      ))}
                      {party.onAccount ? (
                        <tr className="border-t border-border/50"><td className="py-1" colSpan={4}>{t('onAccount')}</td><td className="text-right tabular-nums">{formatRupees(party.onAccount)}</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const EMPTY_LEDGER = { name: '', group: 'Indirect Expenses', creditLimit: '', creditDays: '', phone: '', gstin: '' };

/** Chart of accounts with balances; approvers add ledgers and set credit terms. */
export function LedgersPanel({ business, isApprover, refreshKey, onChanged, notify, t }) {
  const state = useJson(`/api/stock/accounts/ledgers?businessId=${business.id}`, refreshKey);
  const [form, setForm] = useState(EMPTY_LEDGER);
  const [editing, setEditing] = useState(null);

  async function send(method, body, message) {
    try {
      await readJson(await fetch('/api/stock/accounts/ledgers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      notify({ type: 'success', message });
      setEditing(null);
      onChanged();
      return true;
    } catch (err) {
      notify({ type: 'error', message: err.message });
      return false;
    }
  }

  const ledgers = state.data?.ledgers || [];
  return (
    <section className="space-y-3">
      {isApprover ? (
        <form className="glass-panel grid gap-3 rounded-xl p-4 sm:grid-cols-3 lg:grid-cols-6"
          onSubmit={async (e) => { e.preventDefault(); if (await send('POST', { businessId: business.id, ...form }, `${form.name} ✓`)) setForm(EMPTY_LEDGER); }}>
          <div className="sm:col-span-2"><label className={FORM_LABEL_CLASS} htmlFor="nl-name">{t('newLedger')}</label>
            <input id="nl-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={FORM_INPUT_CLASS} placeholder="HDFC Bank / Rent / …" /></div>
          <div><label className={FORM_LABEL_CLASS} htmlFor="nl-group">{t('group')}</label>
            <SelectField id="nl-group" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} className={FORM_INPUT_CLASS}>
              {Object.keys(GROUPS).map((g) => <option key={g} value={g}>{g}</option>)}
            </SelectField></div>
          <div><label className={FORM_LABEL_CLASS} htmlFor="nl-phone">{t('phone')}</label>
            <input id="nl-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={FORM_INPUT_CLASS} /></div>
          <div><label className={FORM_LABEL_CLASS} htmlFor="nl-gstin">{t('gstin')}</label>
            <input id="nl-gstin" value={form.gstin} maxLength={15} onChange={(e) => setForm({ ...form, gstin: e.target.value })} className={FORM_INPUT_CLASS} /></div>
          <div className="flex items-end"><button type="submit" className={PILL_PRIMARY_BUTTON_CLASS}>{t('save')}</button></div>
        </form>
      ) : null}
      <div className="glass-panel overflow-x-auto rounded-xl">
        {!ledgers.length ? <Empty state={state} t={t} /> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">{t('ledger')}</th><th className="px-2">{t('group')}</th><th className="px-2">{t('creditLimit')}</th><th className="px-2">{t('creditDays')}</th><th className="px-2">{t('panTds')}</th><th className="px-2 text-right">{t('balance')}</th><th className="px-2" /></tr>
            </thead>
            <tbody>
              {ledgers.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2">{l.name} {l.system_key ? <span className="ml-1 text-xs text-slate-400">{t('systemLedger')}</span> : null}</td>
                  <td className="px-2 text-xs text-slate-500">{l.group_name}</td>
                  {editing?.id === l.id ? (
                    <>
                      <td className="px-2"><input type="number" min="0" value={editing.creditLimit} onChange={(e) => setEditing({ ...editing, creditLimit: e.target.value })} className={`${FORM_INPUT_CLASS} w-28`} /></td>
                      <td className="px-2"><input type="number" min="0" max="365" value={editing.creditDays} onChange={(e) => setEditing({ ...editing, creditDays: e.target.value })} className={`${FORM_INPUT_CLASS} w-20`} /></td>
                      <td className="px-2">
                        <div className="flex gap-1">
                          <input value={editing.pan} maxLength={10} placeholder="PAN" aria-label="PAN" onChange={(e) => setEditing({ ...editing, pan: e.target.value.toUpperCase() })} className={`${FORM_INPUT_CLASS} w-28 font-mono uppercase`} />
                          <select value={editing.tdsSection} aria-label={t('tdsSection')} onChange={(e) => setEditing({ ...editing, tdsSection: e.target.value })} className={`${FORM_INPUT_CLASS} w-40`}>
                            <option value="">{t('noTds')}</option>
                            {Object.entries(TDS_SECTIONS).map(([key, rule]) => <option key={key} value={key}>{key} · {rule.label}</option>)}
                          </select>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 tabular-nums">{Number(l.credit_limit) ? formatRupees(l.credit_limit) : '—'}</td>
                      <td className="px-2 tabular-nums">{Number(l.credit_days) || '—'}</td>
                      <td className="px-2 text-xs text-slate-500">{[l.pan, l.tds_section].filter(Boolean).join(' · ') || '—'}</td>
                    </>
                  )}
                  <td className="px-2 text-right tabular-nums">{drCr(l.balance, t)}</td>
                  <td className="px-2 py-1 text-right">
                    <div className="flex justify-end gap-1">
                      {isApprover && PARTY_GROUPS.includes(l.group_name) ? (editing?.id === l.id ? (
                        <button type="button" className={PILL_PRIMARY_BUTTON_CLASS}
                          onClick={() => send('PATCH', { ledgerId: l.id, creditLimit: editing.creditLimit, creditDays: editing.creditDays, pan: editing.pan, tdsSection: editing.tdsSection }, `${l.name} ✓`)}>{t('save')}</button>
                      ) : (
                        <button type="button" className={PILL_BUTTON_CLASS}
                          onClick={() => setEditing({ id: l.id, creditLimit: l.credit_limit, creditDays: l.credit_days, pan: l.pan || '', tdsSection: l.tds_section || '' })}>{t('editParty')}</button>
                      )) : null}
                      <Link href={`/stock/accounts/ledger/${l.id}`} className={PILL_BUTTON_CLASS}>{t('statement')}</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Download the books as Tally import XML (accounting vouchers only). */
function TallyExportCard({ business, lastExportedAt, onChanged, notify, t }) {
  const [range, setRange] = useState(() => ({ from: business.books_start_date || '', to: istToday() }));
  const [onlyNew, setOnlyNew] = useState(true);
  const [busy, setBusy] = useState(false);

  async function download(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const query = new URLSearchParams({ businessId: business.id, ...range, ...(onlyNew ? { onlyNew: '1' } : {}) });
      const response = await fetch(`/api/stock/accounts/tally-export?${query}`, { cache: 'no-store' });
      if (!response.ok) await readJson(response);
      const url = URL.createObjectURL(await response.blob());
      Object.assign(document.createElement('a'), { href: url, download: `tally-${range.from}-to-${range.to}.xml` }).click();
      URL.revokeObjectURL(url);
      notify({ type: 'success', message: t('tallyExported', { count: response.headers.get('X-Voucher-Count') || 0 }) });
      onChanged();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={download} className="glass-panel space-y-3 rounded-xl p-4 lg:col-span-2">
      <h3 className="font-semibold">{t('tallyExport')}</h3>
      <p className="text-xs text-slate-500">{t('tallyExportHint')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs"><span className={FORM_LABEL_CLASS}>{t('from')}</span>
          <input type="date" required value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={`${FORM_INPUT_CLASS} w-44`} /></label>
        <label className="text-xs"><span className={FORM_LABEL_CLASS}>{t('to')}</span>
          <input type="date" required value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={`${FORM_INPUT_CLASS} w-44`} /></label>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> {t('tallyOnlyNew')}
        </label>
        <button type="submit" disabled={busy} className={PILL_PRIMARY_BUTTON_CLASS}><Download className="h-3.5 w-3.5" /> {t('tallyDownload')}</button>
      </div>
      <p className="text-xs text-slate-500">
        {t('tallyLastExport')}: {lastExportedAt ? new Date(lastExportedAt).toLocaleString('en-IN') : t('tallyNever')}
      </p>
    </form>
  );
}

/**
 * Suppliers' GSTINs. Without one a purchase books its GST as cost; with one,
 * Re-sync purchases moves it to input tax (ITC).
 */
function SuppliersCard({ suppliers, isApprover, onChanged, notify, t }) {
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);

  async function save(supplier) {
    setBusyId(supplier.id);
    try {
      await readJson(await fetch('/api/stock/accounts/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'supplier_gstin', supplierId: supplier.id, gstin: drafts[supplier.id] }),
      }));
      notify({ type: 'success', message: t('supplierGstinSaved', { name: supplier.name }) });
      setDrafts(({ [supplier.id]: _, ...rest }) => rest);
      onChanged();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="glass-panel space-y-3 rounded-xl p-4 lg:col-span-2">
      <h3 className="font-semibold">{t('suppliersGstin')}</h3>
      <p className="text-xs text-slate-500">{t('suppliersGstinHint')}</p>
      {suppliers.length ? (
        <ul className="divide-y divide-border">
          {suppliers.map((supplier) => {
            const value = drafts[supplier.id] ?? supplier.gst_number ?? '';
            const changed = value.trim().toUpperCase() !== (supplier.gst_number || '');
            return (
              <li key={supplier.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium">{supplier.name}</p>
                  <p className="text-xs text-slate-500">{t('purchasesCount', { count: supplier.purchases })}{supplier.gst_number ? '' : ` · ${t('noItc')}`}</p>
                </div>
                <input
                  value={value}
                  disabled={!isApprover}
                  maxLength={15}
                  placeholder="GSTIN"
                  aria-label={`GSTIN ${supplier.name}`}
                  onChange={(e) => setDrafts((d) => ({ ...d, [supplier.id]: e.target.value.toUpperCase() }))}
                  className={`${FORM_INPUT_CLASS} w-48 font-mono uppercase`}
                />
                {isApprover ? (
                  <button type="button" disabled={!changed || busyId === supplier.id} onClick={() => save(supplier)} className={PILL_BUTTON_CLASS}>
                    {t('save')}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-slate-400">—</p>}
    </div>
  );
}

/** Books start date, Tally opening import, purchase re-sync, suppliers' GSTINs, Tally export. */
export function SetupPanel({ business, isApprover, refreshKey, onChanged, notify, t }) {
  const state = useJson(`/api/stock/accounts/setup?businessId=${business.id}`, refreshKey);
  const [startDate, setStartDate] = useState('');
  const [files, setFiles] = useState({ tb: null, bills: null });
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStartDate(state.data?.business?.books_start_date || ''); }, [state.data]);

  async function run(body, success) {
    setBusy(true);
    setProblems([]);
    try {
      const json = await readJson(await fetch('/api/stock/accounts/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId: business.id, ...body }),
      }));
      notify({ type: 'success', message: success(json) });
      onChanged();
    } catch (err) {
      setProblems(err.details || []);
      notify({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const setup = state.data;
  if (!setup) return <Empty state={state} t={t} />;
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="glass-panel space-y-3 rounded-xl p-4">
        <h3 className="font-semibold">{t('booksStart')}</h3>
        <p className="text-xs text-slate-500">{t('booksStartHint')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" value={startDate} disabled={!isApprover || setup.counts.posted > (setup.opening ? 1 : 0)}
            onChange={(e) => setStartDate(e.target.value)} className={`${FORM_INPUT_CLASS} w-44`} aria-label={t('booksStart')} />
          {isApprover ? (
            <button type="button" disabled={busy || !startDate || startDate === setup.business.books_start_date} className={PILL_PRIMARY_BUTTON_CLASS}
              onClick={() => run({ action: 'start', booksStartDate: startDate }, () => `${t('booksStart')}: ${startDate}`)}>{t('save')}</button>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">{t('posted')}: {setup.counts.posted} · {t('draft')}: {setup.counts.drafts}</p>
        {isApprover && setup.business.books_start_date ? (
          <>
            <p className="text-xs text-slate-500">{t('resyncHint')}</p>
            <button type="button" disabled={busy} className={PILL_BUTTON_CLASS}
              onClick={() => run({ action: 'resync_purchases' }, (json) => t('resynced', { count: json.checked }) + (json.failed.length ? ` ✗ ${json.failed.length}` : ''))}>
              <RefreshCw className="h-3.5 w-3.5" /> {t('resync')}
            </button>
          </>
        ) : null}
      </div>

      <div className="glass-panel space-y-3 rounded-xl p-4">
        <h3 className="font-semibold">{t('openingImport')}</h3>
        <p className="text-xs text-slate-500">{t('openingHint')}</p>
        {setup.opening ? (
          <p className="text-sm">{setup.opening.voucher_number} · {setup.opening.voucher_date} · {formatRupees(setup.opening.amount)}</p>
        ) : null}
        {isApprover && setup.business.books_start_date ? (
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            await run(
              { action: 'opening', trialBalanceCsv: await files.tb.text(), billsCsv: files.bills ? await files.bills.text() : '' },
              (json) => t('imported', { ledgers: json.ledgers, bills: json.bills })
                + (json.difference ? ` ${t('openingDifference', { amount: json.difference.toLocaleString('en-IN') })}` : '')
            );
          }}>
            <label className="block text-xs"><span className={FORM_LABEL_CLASS}>{t('trialBalanceCsv')}</span>
              <input type="file" accept=".csv,text/csv" required onChange={(e) => setFiles((f) => ({ ...f, tb: e.target.files?.[0] || null }))} /></label>
            <label className="block text-xs"><span className={FORM_LABEL_CLASS}>{t('billsCsv')}</span>
              <input type="file" accept=".csv,text/csv" onChange={(e) => setFiles((f) => ({ ...f, bills: e.target.files?.[0] || null }))} /></label>
            <button type="submit" disabled={busy || !files.tb} className={PILL_PRIMARY_BUTTON_CLASS}><Upload className="h-3.5 w-3.5" /> {t('import')}</button>
          </form>
        ) : !setup.business.books_start_date ? <p className="text-sm text-amber-700">{t('booksNotStarted')}</p> : null}
        {problems.length ? (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-rose-600">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        ) : null}
      </div>

      <SuppliersCard suppliers={setup.suppliers || []} isApprover={isApprover} onChanged={onChanged} notify={notify} t={t} />

      {setup.business.books_start_date ? (
        <TallyExportCard business={setup.business} lastExportedAt={setup.counts.last_exported_at} onChanged={onChanged} notify={notify} t={t} />
      ) : null}
    </section>
  );
}

// ─── GST returns (check figures) ──────────────────────────────────────────────

const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const posName = (code) => (code ? `${code} ${GST_STATES[code] || ''}`.trim() : '');
const TAX_COLS = [
  { label: 'Taxable value', get: (r) => r.taxable }, { label: 'IGST', get: (r) => r.igst },
  { label: 'CGST', get: (r) => r.cgst }, { label: 'SGST', get: (r) => r.sgst },
];
// One CSV row per document per GST rate, as the portal's tables lay them out.
const perRate = (docs) => docs.flatMap((doc) => doc.rows.map((row) => ({ ...doc, ...row })));
const DOC_COLS = [
  { label: 'Invoice no', get: 'number' }, { label: 'Date', get: 'date' }, { label: 'GSTIN', get: 'gstin' },
  { label: 'Party', get: 'name' }, { label: 'Place of supply', get: (r) => posName(r.pos) }, { label: 'Invoice value', get: 'value' },
  { label: 'Rate %', get: 'rate' }, ...TAX_COLS, { label: 'IRN', get: (r) => (r.einvoiced ? 'Yes' : '') },
];
const NOTE_COLS = [
  { label: 'Type', get: (r) => (r.type === 'C' ? 'Credit' : 'Debit') }, { label: 'Note no', get: 'number' }, { label: 'Date', get: 'date' },
  { label: 'GSTIN', get: 'gstin' }, { label: 'Party', get: 'name' }, { label: 'Place of supply', get: (r) => posName(r.pos) },
  { label: 'Note value', get: 'value' }, { label: 'Against invoice', get: 'originalNumber' }, { label: 'Invoice date', get: 'originalDate' },
  { label: 'Rate %', get: 'rate' }, ...TAX_COLS, { label: 'IRN', get: (r) => (r.einvoiced ? 'Yes' : '') },
];
const GSTR1_SECTIONS = [
  { key: 'b2b', label: 'B2B (4A)', rows: (g) => perRate(g.b2b), cols: DOC_COLS },
  { key: 'b2cl', label: 'B2C Large (5)', rows: (g) => perRate(g.b2cl), cols: DOC_COLS },
  { key: 'b2cs', label: 'B2C Small (7)', rows: (g) => g.b2cs, cols: [{ label: 'Place of supply', get: (r) => posName(r.pos) }, { label: 'Supply', get: 'supply' }, { label: 'Rate %', get: 'rate' }, ...TAX_COLS] },
  { key: 'cdnr', label: 'Credit/debit notes, registered (9B)', rows: (g) => perRate(g.cdnr), cols: NOTE_COLS },
  { key: 'cdnur', label: 'Credit/debit notes, unregistered (9B)', rows: (g) => perRate(g.cdnur), cols: NOTE_COLS },
];

function downloadCsv(name, columns, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

/**
 * GSTR-1 and GSTR-3B figures for one month, to tick against Tally and the
 * portal before the CA files. Nothing here is uploaded anywhere.
 */
export function GstReturnsPanel({ business, isApprover, refreshKey, onChanged, notify, t }) {
  const [month, setMonth] = useState(() => istToday().slice(0, 7));
  const state = useJson(`/api/stock/accounts/gst-returns?businessId=${business.id}&month=${month}`, refreshKey);
  const [busy, setBusy] = useState(false);

  async function post(url, body, success) {
    setBusy(true);
    try {
      const json = await readJson(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      notify({ type: 'success', message: success(json) });
      onChanged();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }
  const data = state.data;
  const file = (part) => `${part}-${data?.business.gstin || business.id}-${month}.csv`;
  const th = 'px-2 py-1.5 text-right font-medium first:text-left';
  const td = 'px-2 py-1.5 text-right tabular-nums first:text-left';

  return (
    <section className="space-y-4">
      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-xl p-4">
        <label className="text-xs"><span className={FORM_LABEL_CLASS}>{t('gstMonth')}</span>
          <input type="month" value={month} max={istToday().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${FORM_INPUT_CLASS} w-44`} />
        </label>
        <p className="min-w-[14rem] flex-1 text-xs text-slate-500">{t('gstHint')}</p>
      </div>

      {!data ? <Empty state={state} t={t} /> : (
        <>
          <div className="glass-panel overflow-x-auto rounded-xl p-4">
            <h3 className="mb-2 font-semibold">GSTR-1 · {data.business.gstin}</h3>
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-xs text-slate-500">
                <tr><th className={th}>{t('gstSection')}</th><th className={th}>{t('gstCount')}</th><th className={th}>{t('gstTaxable')}</th><th className={th}>IGST</th><th className={th}>CGST</th><th className={th}>SGST</th><th className={th} /></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {GSTR1_SECTIONS.map((section) => {
                  const sum = data.gstr1.summary[section.key];
                  const rows = section.rows(data.gstr1);
                  return (
                    <tr key={section.key}>
                      <td className={td}>{section.label}</td>
                      <td className={td}>{sum.count}</td>
                      <td className={td}>{money2(sum.taxable)}</td><td className={td}>{money2(sum.igst)}</td><td className={td}>{money2(sum.cgst)}</td><td className={td}>{money2(sum.sgst)}</td>
                      <td className={td}>
                        {rows.length ? (
                          <button type="button" className={PILL_BUTTON_CLASS} onClick={() => downloadCsv(file(section.key), section.cols, rows)}>
                            <Download className="h-3.5 w-3.5" /> CSV
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className={td}>{t('gstTotal')}</td><td className={td} />
                  <td className={td}>{money2(data.gstr1.total.taxable)}</td><td className={td}>{money2(data.gstr1.total.igst)}</td><td className={td}>{money2(data.gstr1.total.cgst)}</td><td className={td}>{money2(data.gstr1.total.sgst)}</td><td className={td} />
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">{t('gstIrnNote')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.gstr1.hsn.length ? (
                <button type="button" className={PILL_BUTTON_CLASS} onClick={() => downloadCsv(file('hsn'), [
                  { label: 'B2B/B2C', get: (r) => r.side.toUpperCase() }, { label: 'HSN', get: 'hsn' }, { label: 'UQC', get: 'uqc' },
                  { label: 'Quantity', get: 'qty' }, { label: 'Rate %', get: 'rate' }, ...TAX_COLS,
                ], data.gstr1.hsn)}>
                  <Download className="h-3.5 w-3.5" /> {t('gstHsn')} (12)
                </button>
              ) : null}
              {data.gstr1.documents.length ? (
                <button type="button" className={PILL_BUTTON_CLASS} onClick={() => downloadCsv(file('documents'), [
                  { label: 'Nature of document', get: 'nature' }, { label: 'From', get: 'from' }, { label: 'To', get: 'to' },
                  { label: 'Total', get: 'total' }, { label: 'Cancelled', get: 'cancelled' }, { label: 'Net issued', get: 'net' },
                ], data.gstr1.documents)}>
                  <Download className="h-3.5 w-3.5" /> {t('gstDocuments')} (13)
                </button>
              ) : null}
            </div>
            {data.gstr1.documents.length ? (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                {data.gstr1.documents.map((d) => (
                  <li key={`${d.nature}-${d.from}`}>{d.nature}: {d.from} – {d.to} · {d.total} ({t('gstCancelled', { count: d.cancelled })})</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="glass-panel overflow-x-auto rounded-xl p-4">
            <h3 className="mb-2 font-semibold">GSTR-3B</h3>
            {data.gstr3b.purchasesWithoutGstin.count ? (
              <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {t('gstNoGstinPurchases', { count: data.gstr3b.purchasesWithoutGstin.count, value: money2(data.gstr3b.purchasesWithoutGstin.value) })}
              </p>
            ) : null}
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-xs text-slate-500">
                <tr><th className={th}>{t('gstSection')}</th><th className={th}>{t('gstTaxable')}</th><th className={th}>IGST</th><th className={th}>CGST</th><th className={th}>SGST</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ['3.1(a) ' + t('gstOutward'), data.gstr3b.outward],
                  ['3.1(c) ' + t('gstNil'), { taxable: data.gstr3b.nilRated.taxable }],
                  ['4(A)(5) ' + t('gstItcPurchases'), data.gstr3b.itc.purchases],
                  ['4(A)(5) ' + t('gstItcExpenses'), data.gstr3b.itc.expenses],
                  ['4(B) ' + t('gstItcReversed'), data.gstr3b.itc.reversals],
                  ['4(C) ' + t('gstItcNet'), data.gstr3b.itc.net],
                  [t('gstPayable'), data.gstr3b.payable],
                ].map(([label, row]) => (
                  <tr key={label} className={label === t('gstPayable') ? 'font-semibold' : ''}>
                    <td className={td}>{label}</td>
                    <td className={td}>{row.taxable == null ? '' : money2(row.taxable)}</td>
                    <td className={td}>{row.igst == null ? '' : money2(row.igst)}</td>
                    <td className={td}>{row.cgst == null ? '' : money2(row.cgst)}</td>
                    <td className={td}>{row.sgst == null ? '' : money2(row.sgst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">{t('gstPayableNote')}</p>
            {data.gstr2b ? (
              <p className="mt-1 text-xs text-slate-500">
                {t('gstItcPer2b')}: IGST {money2(data.gstr2b.itc.igst)} · CGST {money2(data.gstr2b.itc.cgst)} · SGST {money2(data.gstr2b.itc.sgst)}
              </p>
            ) : null}
            {data.gstr3b.interStateUnregistered.length ? (
              <>
                <h4 className="mt-4 text-sm font-semibold">3.2 {t('gstInterUnreg')}</h4>
                <table className="mt-1 w-full max-w-md text-sm">
                  <tbody className="divide-y divide-border">
                    {data.gstr3b.interStateUnregistered.map((row) => (
                      <tr key={row.pos}><td className={td}>{posName(row.pos)}</td><td className={td}>{money2(row.taxable)}</td><td className={td}>{money2(row.igst)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </div>

          <Gstr2bCard data={data} month={month} isApprover={isApprover} busy={busy} post={post} file={file} t={t} />
        </>
      )}
    </section>
  );
}

/** GSTR-2B: upload the portal's file, see which supplier bills it confirms. */
function Gstr2bCard({ data, month, isApprover, busy, post, file, t }) {
  const result = data.gstr2b;
  const billCols = [
    { label: 'Status', get: 'status' }, { label: 'Supplier GSTIN', get: 'gstin' }, { label: 'Supplier', get: 'supplier' },
    { label: 'Bill no', get: 'number' }, { label: 'Date', get: 'date' }, { label: 'Value in 2B', get: 'value2b' },
    { label: 'Value in books', get: 'valueBooks' }, { label: 'Difference', get: 'diff' },
  ];
  const allRows = result ? [
    ...result.matched.map(({ row, purchase }) => ({ status: 'Matched', gstin: row.gstin, supplier: purchase.supplier, number: row.number, date: row.date, value2b: row.value, valueBooks: purchase.grandTotal, diff: 0 })),
    ...result.mismatched.map(({ row, purchase, diff }) => ({ status: 'Value differs', gstin: row.gstin, supplier: purchase.supplier, number: row.number, date: row.date, value2b: row.value, valueBooks: purchase.grandTotal, diff })),
    ...result.only2b.map(({ row }) => ({ status: 'In 2B, not in books', gstin: row.gstin, supplier: row.tradeName, number: row.number, date: row.date, value2b: row.value })),
    ...result.onlyBooks.map((p) => ({ status: 'In books, not in 2B', gstin: p.gstin, supplier: p.supplier, number: p.number, date: p.date, valueBooks: p.grandTotal })),
  ] : [];

  return (
    <div className="glass-panel space-y-3 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">GSTR-2B</h3>
        {isApprover ? (
          <label className={`${PILL_BUTTON_CLASS} cursor-pointer`}>
            <Upload className="h-3.5 w-3.5" /> {t('gst2bUpload')}
            <input type="file" accept=".json,application/json" hidden disabled={busy} onChange={async (e) => {
              const picked = e.target.files?.[0];
              e.target.value = '';
              if (picked) await post('/api/stock/accounts/gst-returns', { businessId: data.business.id, month, text: await picked.text() }, (json) => t('gst2bImported', { rows: json.rows, period: json.period }));
            }} />
          </label>
        ) : null}
      </div>
      {!result ? <p className="text-sm text-slate-500">{t('gst2bNone')}</p> : (
        <>
          <p className="text-xs text-slate-500">{t('gst2bSummary', {
            matched: result.matched.length, mismatched: result.mismatched.length, only2b: result.only2b.length, onlyBooks: result.onlyBooks.length,
          })}</p>
          {result.onlyBooks.length ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{t('gst2bHold')}</p> : null}
          {result.only2b.some((x) => x.proposal) ? (
            <ul className="space-y-1 text-sm">
              {result.only2b.filter((x) => x.proposal).map(({ row, proposal }) => (
                <li key={`${row.gstin}-${row.number}`} className="flex flex-wrap items-center gap-2">
                  <span>{t('gst2bProposal', { supplier: proposal.supplier, gstin: proposal.gstin, bill: row.number })}</span>
                  {isApprover ? (
                    <button type="button" disabled={busy} className={PILL_BUTTON_CLASS}
                      onClick={() => post('/api/stock/accounts/setup', { businessId: data.business.id, action: 'supplier_gstin', supplierId: proposal.supplierId, gstin: proposal.gstin }, () => t('supplierGstinSaved', { name: proposal.supplier }))}>
                      {t('gst2bSetGstin')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {allRows.length ? (
            <button type="button" className={PILL_BUTTON_CLASS} onClick={() => downloadCsv(file('gstr2b-match'), billCols, allRows)}>
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

// ─── Reports: P&L, balance sheet, trial balance, stock ───────────────────────

const REPORTS = ['pl', 'bs', 'trial', 'stock', 'tds'];
/** 1 April of the financial year a date falls in. */
const fyStart = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
};

/** Group blocks: group heading, its ledgers, its total. Rows also feed the CSV. */
function GroupBlocks({ groups }) {
  return groups.map((g) => (
    <Fragment key={g.group}>
      <tr className="font-medium"><td className="px-2 pt-2">{g.group}</td><td className="px-2 pt-2 text-right tabular-nums">{money2(g.total)}</td></tr>
      {g.ledgers.map((l) => (
        <tr key={`${g.group}-${l.name}`} className="text-slate-500"><td className="px-2 pl-6">{l.name}</td><td className="px-2 text-right tabular-nums">{money2(l.amount)}</td></tr>
      ))}
    </Fragment>
  ));
}
const groupCsv = (side, groups) => groups.flatMap((g) => [
  { side, group: g.group, ledger: '', amount: g.total },
  ...g.ledgers.map((l) => ({ side, group: g.group, ledger: l.name, amount: l.amount })),
]);
const GROUP_CSV_COLS = [{ label: 'Side', get: 'side' }, { label: 'Group', get: 'group' }, { label: 'Ledger', get: 'ledger' }, { label: 'Amount', get: 'amount' }];

/** Profit & loss, balance sheet, trial balance and stock summary for a business. */
export function ReportsPanel({ business, refreshKey, t }) {
  const today = istToday();
  const [kind, setKind] = useState('pl');
  const [range, setRange] = useState(() => ({ from: fyStart(today), to: today }));
  const ranged = kind === 'pl' || kind === 'tds';
  const query = new URLSearchParams({ businessId: business.id, kind, to: range.to, ...(ranged ? { from: range.from } : {}) });
  const state = useJson(`/api/stock/accounts/reports?${query}`, refreshKey);
  const data = state.data;
  const file = `${kind}-${business.id}-${ranged ? `${range.from}-to-` : ''}${range.to}.csv`;
  const card = 'glass-panel overflow-x-auto rounded-xl p-4';
  const totalRow = (label, amount, strong = true) => (
    <tr className={`border-t border-border ${strong ? 'font-semibold' : ''}`}><td className="px-2 py-1.5">{label}</td><td className="px-2 py-1.5 text-right tabular-nums">{money2(amount)}</td></tr>
  );
  const warnings = data ? [
    data.stockUncosted ? t('reportUncosted', { count: data.stockUncosted }) : null,
    data.stockIsCompanyWide && ['pl', 'bs', 'stock'].includes(kind) ? t('reportStockCompanyWide') : null,
  ].filter(Boolean) : [];

  return (
    <section className="space-y-4">
      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-xl p-4">
        <div className="flex flex-wrap gap-2" role="tablist">
          {REPORTS.map((key) => (
            <button key={key} type="button" role="tab" aria-selected={kind === key} onClick={() => setKind(key)} className={kind === key ? PILL_PRIMARY_BUTTON_CLASS : PILL_BUTTON_CLASS}>
              {t(`report_${key}`)}
            </button>
          ))}
        </div>
        {ranged ? (
          <label className="text-xs"><span className={FORM_LABEL_CLASS}>{t('from')}</span>
            <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} className={`${FORM_INPUT_CLASS} w-40`} /></label>
        ) : null}
        <label className="text-xs"><span className={FORM_LABEL_CLASS}>{ranged ? t('to') : t('reportAsOn')}</span>
          <input type="date" value={range.to} min={ranged ? range.from : undefined} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} className={`${FORM_INPUT_CLASS} w-40`} /></label>
      </div>

      {!data ? <Empty state={state} t={t} /> : (
        <>
          {warnings.map((w) => <p key={w} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{w}</p>)}

          {kind === 'pl' && data.pl ? (
            <div className={card}>
              <table className="w-full max-w-2xl text-sm">
                <tbody>
                  <tr><td className="px-2 pb-1 font-semibold" colSpan={2}>{t('reportTrading')}</td></tr>
                  <tr><td className="px-2">{t('reportOpeningStock')}</td><td className="px-2 text-right tabular-nums">{money2(data.pl.trading.openingStock)}</td></tr>
                  <GroupBlocks groups={data.pl.trading.purchases} />
                  <GroupBlocks groups={data.pl.trading.directExpenses} />
                  <GroupBlocks groups={data.pl.trading.sales} />
                  <GroupBlocks groups={data.pl.trading.directIncome} />
                  <tr><td className="px-2 pt-2">{t('reportClosingStock')}</td><td className="px-2 pt-2 text-right tabular-nums">{money2(data.pl.trading.closingStock)}</td></tr>
                  {totalRow(t('reportGrossProfit'), data.pl.grossProfit)}
                  <GroupBlocks groups={data.pl.indirectIncome} />
                  <GroupBlocks groups={data.pl.indirectExpenses} />
                  {totalRow(t('reportNetProfit'), data.pl.netProfit)}
                </tbody>
              </table>
              <button type="button" className={`${PILL_BUTTON_CLASS} mt-3`} onClick={() => downloadCsv(file, GROUP_CSV_COLS, [
                { side: 'Trading', group: 'Opening stock', ledger: '', amount: data.pl.trading.openingStock },
                ...groupCsv('Trading (Dr)', [...data.pl.trading.purchases, ...data.pl.trading.directExpenses]),
                ...groupCsv('Trading (Cr)', [...data.pl.trading.sales, ...data.pl.trading.directIncome]),
                { side: 'Trading', group: 'Closing stock', ledger: '', amount: data.pl.trading.closingStock },
                { side: '', group: 'Gross profit', ledger: '', amount: data.pl.grossProfit },
                ...groupCsv('Income', data.pl.indirectIncome), ...groupCsv('Expense', data.pl.indirectExpenses),
                { side: '', group: 'Net profit', ledger: '', amount: data.pl.netProfit },
              ])}><Download className="h-3.5 w-3.5" /> CSV</button>
            </div>
          ) : null}

          {kind === 'bs' && data.bs ? (
            <div className={card}>
              {data.bs.difference ? <p className="mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{t('reportDifference', { amount: money2(data.bs.difference) })}</p> : null}
              <div className="grid gap-6 lg:grid-cols-2">
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="px-2 pb-1 font-semibold" colSpan={2}>{t('reportLiabilities')}</td></tr>
                    <GroupBlocks groups={data.bs.liabilities} />
                    <tr className="font-medium"><td className="px-2 pt-2">{t('reportProfitAccount')}</td><td className="px-2 pt-2 text-right tabular-nums">{money2(data.bs.profit)}</td></tr>
                    {totalRow(t('gstTotal'), data.bs.totalLiabilities)}
                  </tbody>
                </table>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="px-2 pb-1 font-semibold" colSpan={2}>{t('reportAssets')}</td></tr>
                    <GroupBlocks groups={data.bs.assets} />
                    {totalRow(t('gstTotal'), data.bs.totalAssets)}
                  </tbody>
                </table>
              </div>
              <button type="button" className={`${PILL_BUTTON_CLASS} mt-3`} onClick={() => downloadCsv(file, GROUP_CSV_COLS, [
                ...groupCsv('Liabilities', data.bs.liabilities),
                { side: 'Liabilities', group: 'Profit & Loss A/c', ledger: '', amount: data.bs.profit },
                ...groupCsv('Assets', data.bs.assets),
              ])}><Download className="h-3.5 w-3.5" /> CSV</button>
            </div>
          ) : null}

          {kind === 'trial' && data.trial ? (
            <div className={card}>
              {data.trial.difference ? <p className="mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{t('reportDifference', { amount: money2(data.trial.difference) })}</p> : null}
              <table className="w-full max-w-3xl text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="px-2 py-1 text-left">{t('ledger')}</th><th className="px-2 py-1 text-left">{t('group')}</th><th className="px-2 py-1 text-right">Dr</th><th className="px-2 py-1 text-right">Cr</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {data.trial.rows.map((r) => (
                    <tr key={`${r.group}-${r.name}`}><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1 text-slate-500">{r.group}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.balance > 0 ? money2(r.balance) : ''}</td><td className="px-2 py-1 text-right tabular-nums">{r.balance < 0 ? money2(-r.balance) : ''}</td></tr>
                  ))}
                  <tr className="font-semibold"><td className="px-2 py-1.5" colSpan={2}>{t('gstTotal')}</td><td className="px-2 py-1.5 text-right tabular-nums">{money2(data.trial.debit)}</td><td className="px-2 py-1.5 text-right tabular-nums">{money2(data.trial.credit)}</td></tr>
                </tbody>
              </table>
              <button type="button" className={`${PILL_BUTTON_CLASS} mt-3`} onClick={() => downloadCsv(file, [
                { label: 'Ledger', get: 'name' }, { label: 'Group', get: 'group' }, { label: 'Primary group', get: 'primary' },
                { label: 'Debit', get: (r) => (r.balance > 0 ? r.balance : '') }, { label: 'Credit', get: (r) => (r.balance < 0 ? -r.balance : '') },
              ], data.trial.rows)}><Download className="h-3.5 w-3.5" /> CSV</button>
            </div>
          ) : null}

          {kind === 'tds' && data.tds ? (
            <div className={card}>
              <p className="mb-2 text-xs text-slate-500">{t('tdsHint')}</p>
              <h4 className="text-sm font-semibold">{t('tdsChallans')}</h4>
              {data.tds.challans.length ? (
                <table className="mb-4 mt-1 w-full max-w-xl text-sm">
                  <thead className="text-xs text-slate-500"><tr><th className="px-2 py-1 text-left">{t('gstMonth')}</th><th className="px-2 py-1 text-left">{t('tdsSection')}</th><th className="px-2 py-1 text-right">TDS</th><th className="px-2 py-1 text-right">{t('tdsDue')}</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {data.tds.challans.map((c) => (
                      <tr key={`${c.month}-${c.section}`}><td className="px-2 py-1">{c.month}</td><td className="px-2 py-1">{c.section}</td><td className="px-2 py-1 text-right tabular-nums">{money2(c.tds)}</td><td className="px-2 py-1 text-right">{c.due}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="mb-4 text-sm text-slate-400">—</p>}
              <h4 className="text-sm font-semibold">{t('tdsDeductees')}</h4>
              {data.tds.rows.length ? (
                <table className="mt-1 w-full min-w-[40rem] text-sm">
                  <thead className="text-xs text-slate-500"><tr><th className="px-2 py-1 text-left">{t('date')}</th><th className="px-2 py-1 text-left">{t('party')}</th><th className="px-2 py-1 text-left">PAN</th><th className="px-2 py-1 text-left">{t('tdsSection')}</th><th className="px-2 py-1 text-right">{t('tdsBase')}</th><th className="px-2 py-1 text-right">%</th><th className="px-2 py-1 text-right">TDS</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {data.tds.rows.map((r) => (
                      <tr key={`${r.voucher_number}-${r.date}`}><td className="px-2 py-1">{r.date}</td><td className="px-2 py-1">{r.party}</td><td className="px-2 py-1 font-mono text-xs">{r.pan || '—'}</td><td className="px-2 py-1">{r.section}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{money2(r.base)}</td><td className="px-2 py-1 text-right">{r.rate}</td><td className="px-2 py-1 text-right tabular-nums">{money2(r.tds)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-slate-400">—</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {data.tds.rows.length ? (
                  <button type="button" className={PILL_BUTTON_CLASS} onClick={() => downloadCsv(`tds-26q-${range.from}-to-${range.to}.csv`, [
                    { label: 'Quarter', get: 'quarter' }, { label: 'Date', get: 'date' }, { label: 'Voucher', get: 'voucher_number' },
                    { label: 'Deductee', get: 'party' }, { label: 'PAN', get: 'pan' }, { label: 'Section', get: 'section' },
                    { label: 'Amount paid/credited', get: 'base' }, { label: 'Rate %', get: 'rate' }, { label: 'TDS', get: 'tds' },
                  ], data.tds.rows)}><Download className="h-3.5 w-3.5" /> 26Q CSV</button>
                ) : null}
                {data.tds.challans.length ? (
                  <button type="button" className={PILL_BUTTON_CLASS} onClick={() => downloadCsv(`tds-challans-${range.from}-to-${range.to}.csv`, [
                    { label: 'Month', get: 'month' }, { label: 'Section', get: 'section' }, { label: 'TDS', get: 'tds' }, { label: 'Due by', get: 'due' },
                  ], data.tds.challans)}><Download className="h-3.5 w-3.5" /> {t('tdsChallans')} CSV</button>
                ) : null}
              </div>
            </div>
          ) : null}

          {kind === 'stock' && data.stock ? (
            <div className={card}>
              <p className="mb-2 text-xs text-slate-500">{t('reportStockHint')}</p>
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="px-2 py-1 text-left">{t('reportItem')}</th><th className="px-2 py-1 text-right">{t('reportQty')}</th><th className="px-2 py-1 text-right">{t('reportBroken')}</th><th className="px-2 py-1 text-right">{t('reportRate')}</th><th className="px-2 py-1 text-right">{t('reportValue')}</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {data.stock.rows.slice(0, 200).map((r) => (
                    <tr key={r.itemId}><td className="px-2 py-1">{r.sku} · {r.name}</td><td className="px-2 py-1 text-right tabular-nums">{r.qty} {r.unit}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.broken || ''}</td><td className="px-2 py-1 text-right tabular-nums">{r.unitCost == null ? '—' : money2(r.unitCost)}</td><td className="px-2 py-1 text-right tabular-nums">{money2(r.value)}</td></tr>
                  ))}
                  <tr className="font-semibold"><td className="px-2 py-1.5" colSpan={4}>{t('gstTotal')}</td><td className="px-2 py-1.5 text-right tabular-nums">{money2(data.stock.total)}</td></tr>
                </tbody>
              </table>
              {data.stock.rows.length > 200 ? <p className="mt-1 text-xs text-slate-500">{t('reportFirst200', { count: data.stock.rows.length })}</p> : null}
              <button type="button" className={`${PILL_BUTTON_CLASS} mt-3`} onClick={() => downloadCsv(file, [
                { label: 'SKU', get: 'sku' }, { label: 'Item', get: 'name' }, { label: 'Unit', get: 'unit' }, { label: 'Quantity', get: 'qty' },
                { label: 'Broken (nil value)', get: 'broken' }, { label: 'Rate (weighted average)', get: (r) => r.unitCost ?? '' }, { label: 'Value', get: 'value' },
              ], data.stock.rows)}><Download className="h-3.5 w-3.5" /> CSV</button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
