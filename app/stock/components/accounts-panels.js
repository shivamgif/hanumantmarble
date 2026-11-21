'use client';
import { SelectField } from '@/components/ui/select';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Ban, Check, ChevronDown, ChevronRight, Download, MessageCircle, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { istToday } from '@/lib/attendance.mjs';
import { AGE_BUCKETS, GROUPS, PARTY_GROUPS, VOUCHER_TYPES } from '@/lib/accounts.mjs';
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
              <tr><th className="px-3 py-2">{t('ledger')}</th><th className="px-2">{t('group')}</th><th className="px-2">{t('creditLimit')}</th><th className="px-2">{t('creditDays')}</th><th className="px-2 text-right">{t('balance')}</th><th className="px-2" /></tr>
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
                    </>
                  ) : (
                    <>
                      <td className="px-2 tabular-nums">{Number(l.credit_limit) ? formatRupees(l.credit_limit) : '—'}</td>
                      <td className="px-2 tabular-nums">{Number(l.credit_days) || '—'}</td>
                    </>
                  )}
                  <td className="px-2 text-right tabular-nums">{drCr(l.balance, t)}</td>
                  <td className="px-2 py-1 text-right">
                    <div className="flex justify-end gap-1">
                      {isApprover && PARTY_GROUPS.includes(l.group_name) ? (editing?.id === l.id ? (
                        <button type="button" className={PILL_PRIMARY_BUTTON_CLASS}
                          onClick={() => send('PATCH', { ledgerId: l.id, creditLimit: editing.creditLimit, creditDays: editing.creditDays }, `${l.name} ✓`)}>{t('save')}</button>
                      ) : (
                        <button type="button" className={PILL_BUTTON_CLASS}
                          onClick={() => setEditing({ id: l.id, creditLimit: l.credit_limit, creditDays: l.credit_days })}>{t('creditLimit')}</button>
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

/** Books start date, Tally opening import, purchase re-sync, Tally export. */
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

      {setup.business.books_start_date ? (
        <TallyExportCard business={setup.business} lastExportedAt={setup.counts.last_exported_at} onChanged={onChanged} notify={notify} t={t} />
      ) : null}
    </section>
  );
}
