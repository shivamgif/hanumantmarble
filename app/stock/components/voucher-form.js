'use client';
import { SelectField } from '@/components/ui/select';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { istToday } from '@/lib/attendance.mjs';
import { allocateFifo, CASH_BANK_GROUPS, PARTY_GROUPS } from '@/lib/accounts.mjs';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';
import { formatRupees } from './invoice-form';

/** stock.accounts.* in the current language, with {slots} filled from `vars`. */
export function useAccountsText() {
  const { language } = useLanguage();
  return useCallback(
    (key, vars) => String(getTranslation(`stock.accounts.${key}`, language)).replace(/\{(\w+)\}/g, (_, name) => vars?.[name] ?? ''),
    [language]
  );
}

/** ₹1,200.00 Dr / ₹300.00 Cr — the sign convention made readable. */
export function drCr(amount, t) {
  const value = Number(amount) || 0;
  if (!value) return formatRupees(0);
  return `${formatRupees(Math.abs(value))} ${value > 0 ? t('dr') : t('cr')}`;
}

async function readJson(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.error || 'Request failed'), { details: json.details });
  return json;
}

/** A ledger picked by typing its name (native datalist: works for hundreds of parties). */
function LedgerPicker({ id, ledgers, value, onChange, placeholder }) {
  const [text, setText] = useState(() => ledgers.find((l) => Number(l.id) === Number(value))?.name || '');
  useEffect(() => {
    if (!value) setText('');
  }, [value]);
  return (
    <>
      <input
        id={id}
        list={`${id}-list`}
        value={text}
        placeholder={placeholder}
        className={FORM_INPUT_CLASS}
        onChange={(e) => {
          setText(e.target.value);
          const match = ledgers.find((l) => l.name.toLowerCase() === e.target.value.trim().toLowerCase());
          onChange(match ? Number(match.id) : null);
        }}
      />
      <datalist id={`${id}-list`}>
        {ledgers.map((l) => <option key={l.id} value={l.name}>{l.group_name}</option>)}
      </datalist>
    </>
  );
}

/**
 * Settle a receipt/payment against a party's open bills. Defaults to oldest
 * first; any amount left over stays on account.
 */
export function BillAllocator({ businessId, ledgerId, kind, amount, value, onChange, t }) {
  const [bills, setBills] = useState(null);
  useEffect(() => {
    if (!ledgerId) return setBills([]);
    let cancelled = false;
    const side = kind === 'payment' ? 'payable' : 'receivable';
    fetch(`/api/stock/accounts/outstanding?businessId=${businessId}&kind=${side}&ledgerId=${ledgerId}`, { cache: 'no-store' })
      .then(readJson)
      .then((json) => {
        if (cancelled) return;
        const open = (json.parties[0]?.bills || []).filter((b) => b.amount > 0)
          .sort((a, b) => String(a.billDate).localeCompare(String(b.billDate)));
        setBills(open);
        onChange(allocateFifo(amount, open.map((b) => ({ billRef: b.billRef, balance: b.amount }))));
      })
      .catch(() => !cancelled && setBills([]));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch per party, not per keystroke
  }, [businessId, ledgerId, kind]);

  if (!ledgerId) return null;
  if (!bills) return <p className="text-xs text-slate-400">{t('loading')}</p>;
  if (!bills.length) return <p className="text-xs text-slate-500">{t('unallocated')}: {formatRupees(amount)}</p>;

  const allocated = value.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const setFor = (billRef, raw) => {
    const rest = value.filter((a) => a.billRef !== billRef);
    onChange(Number(raw) > 0 ? [...rest, { billRef, amount: Number(raw) }] : rest);
  };
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{t('allocate')}</span>
        <button
          type="button"
          className={PILL_BUTTON_CLASS}
          onClick={() => onChange(allocateFifo(amount, bills.map((b) => ({ billRef: b.billRef, balance: b.amount }))))}
        >
          {t('autoAllocate')}
        </button>
      </div>
      {bills.map((bill) => (
        <label key={bill.billRef} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-[9rem] flex-1">
            {bill.billRef} <span className="text-xs text-slate-500">{bill.billDate} · {formatRupees(bill.amount)}</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            max={bill.amount}
            value={value.find((a) => a.billRef === bill.billRef)?.amount ?? ''}
            onChange={(e) => setFor(bill.billRef, e.target.value)}
            className={`${FORM_INPUT_CLASS} w-32`}
          />
        </label>
      ))}
      <p className={`text-xs ${allocated > Number(amount) ? 'text-rose-600' : 'text-slate-500'}`}>
        {t('unallocated')}: {formatRupees(Number(amount || 0) - allocated)}
      </p>
    </div>
  );
}

const blank = () => ({
  type: 'receipt', date: istToday(), ledgerId: null, cashBankLedgerId: null, amount: '', reference: '', narration: '',
  gstRate: '', interState: false, fromLedgerId: null, toLedgerId: null, allocations: [],
  lines: [{ ledgerId: null, debit: '', credit: '' }, { ledgerId: null, debit: '', credit: '' }],
});

/**
 * Enter a receipt, payment, contra or journal. Everything is saved as a draft;
 * a different approver posts it. Salespeople get receipts only, unsettled.
 */
export function VoucherSheet({ open, onOpenChange, business, ledgers, role, onSaved, t }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isSalesperson = role === 'salesperson';
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (open) { setForm(blank()); setError(''); }
  }, [open]);

  const cashBank = useMemo(() => ledgers.filter((l) => CASH_BANK_GROUPS.includes(l.group_name)), [ledgers]);
  const others = useMemo(() => ledgers.filter((l) => !CASH_BANK_GROUPS.includes(l.group_name) && l.is_active !== false), [ledgers]);
  const counter = ledgers.find((l) => Number(l.id) === Number(form.ledgerId));
  const counterIsParty = counter && PARTY_GROUPS.includes(counter.group_name);
  const journalDiff = form.lines.reduce((s, l) => s + Number(l.debit || 0) - Number(l.credit || 0), 0);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { businessId: business.id, type: form.type, date: form.date, reference: form.reference, narration: form.narration };
      if (form.type === 'receipt' || form.type === 'payment') {
        Object.assign(payload, {
          ledgerId: form.ledgerId, cashBankLedgerId: form.cashBankLedgerId, amount: form.amount, instrumentNo: form.reference,
          allocations: counterIsParty && !isSalesperson ? form.allocations : [],
          gstRate: form.gstRate, interState: form.interState,
        });
      } else if (form.type === 'contra') {
        Object.assign(payload, { fromLedgerId: form.fromLedgerId, toLedgerId: form.toLedgerId, amount: form.amount, instrumentNo: form.reference });
      } else {
        payload.lines = form.lines.filter((l) => l.ledgerId);
      }
      await readJson(await fetch('/api/stock/accounts/vouchers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }));
      onSaved?.(t('draftSaved'));
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const types = isSalesperson ? ['receipt'] : ['receipt', 'payment', 'contra', 'journal'];
  const field = (label, child, htmlFor) => (
    <div>
      <label className={FORM_LABEL_CLASS} htmlFor={htmlFor}>{label}</label>
      {child}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[640px]">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="text-base">{t('newVoucher')}</SheetTitle>
          <SheetDescription className="text-xs">{isSalesperson ? t('salespersonHint') : t('draftSaved')}</SheetDescription>
        </SheetHeader>
        <form onSubmit={save} className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {types.map((type) => (
              <button key={type} type="button" role="tab" aria-selected={form.type === type}
                onClick={() => set({ type, ledgerId: null, allocations: [] })}
                className={form.type === type ? PILL_PRIMARY_BUTTON_CLASS : PILL_BUTTON_CLASS}>
                {t(type)}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {field(t('date'), <input id="v-date" type="date" required value={form.date} max={istToday()} onChange={(e) => set({ date: e.target.value })} className={FORM_INPUT_CLASS} />, 'v-date')}
            {field(t('reference'), <input id="v-ref" value={form.reference} onChange={(e) => set({ reference: e.target.value })} className={FORM_INPUT_CLASS} />, 'v-ref')}
          </div>

          {form.type === 'receipt' || form.type === 'payment' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {field(form.type === 'receipt' ? t('receivedFrom') : t('paidTo'),
                <LedgerPicker id="v-party" ledgers={isSalesperson ? others.filter((l) => l.group_name === 'Sundry Debtors') : others}
                  value={form.ledgerId} onChange={(id) => set({ ledgerId: id, allocations: [] })} />, 'v-party')}
              {field(t('cashBank'),
                <SelectField id="v-cash" required value={form.cashBankLedgerId || ''} onChange={(e) => set({ cashBankLedgerId: Number(e.target.value) || null })} className={FORM_INPUT_CLASS}>
                  <option value="">—</option>
                  {cashBank.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </SelectField>, 'v-cash')}
              {field(t('amount'), <input id="v-amount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => set({ amount: e.target.value })} className={FORM_INPUT_CLASS} />, 'v-amount')}
              {form.type === 'payment' && counter && !counterIsParty ? (
                <>
                  {field(t('gstOnExpense'), <input id="v-gst" type="number" min="0" step="0.25" value={form.gstRate} placeholder="0" onChange={(e) => set({ gstRate: e.target.value })} className={FORM_INPUT_CLASS} />, 'v-gst')}
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" checked={form.interState} onChange={(e) => set({ interState: e.target.checked })} /> {t('interState')}
                  </label>
                </>
              ) : null}
              {counterIsParty && !isSalesperson && Number(form.amount) > 0 ? (
                <div className="sm:col-span-2">
                  <BillAllocator businessId={business.id} ledgerId={form.ledgerId} kind={form.type} amount={Number(form.amount)}
                    value={form.allocations} onChange={(allocations) => set({ allocations })} t={t} />
                </div>
              ) : null}
            </div>
          ) : null}

          {form.type === 'contra' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {['fromLedgerId', 'toLedgerId'].map((key) => field(t(key === 'fromLedgerId' ? 'fromAccount' : 'toAccount'),
                <SelectField id={`v-${key}`} required value={form[key] || ''} onChange={(e) => set({ [key]: Number(e.target.value) || null })} className={FORM_INPUT_CLASS}>
                  <option value="">—</option>
                  {cashBank.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </SelectField>, `v-${key}`))}
              {field(t('amount'), <input id="v-camount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => set({ amount: e.target.value })} className={FORM_INPUT_CLASS} />, 'v-camount')}
            </div>
          ) : null}

          {form.type === 'journal' ? (
            <div className="space-y-2">
              {form.lines.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_7rem_auto] items-center gap-2">
                  <LedgerPicker id={`v-j${i}`} ledgers={ledgers} value={line.ledgerId} placeholder={t('ledger')}
                    onChange={(id) => set({ lines: form.lines.map((l, j) => (j === i ? { ...l, ledgerId: id } : l)) })} />
                  {['debit', 'credit'].map((side) => (
                    <input key={side} type="number" min="0" step="0.01" placeholder={t(side)} aria-label={t(side)} value={line[side]}
                      onChange={(e) => set({ lines: form.lines.map((l, j) => (j === i ? { ...l, [side]: e.target.value } : l)) })}
                      className={FORM_INPUT_CLASS} />
                  ))}
                  <button type="button" aria-label={t('discard')} disabled={form.lines.length <= 2}
                    onClick={() => set({ lines: form.lines.filter((_, j) => j !== i) })} className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button type="button" className={PILL_BUTTON_CLASS} onClick={() => set({ lines: [...form.lines, { ledgerId: null, debit: '', credit: '' }] })}>
                  <Plus className="h-3.5 w-3.5" /> {t('addLine')}
                </button>
                <span className={`text-sm ${Math.abs(journalDiff) > 0.004 ? 'text-rose-600' : 'text-emerald-600'}`}>{t('difference')}: {formatRupees(journalDiff)}</span>
              </div>
            </div>
          ) : null}

          {field(t('narration'), <textarea id="v-narr" rows={2} value={form.narration} onChange={(e) => set({ narration: e.target.value })} className={FORM_INPUT_CLASS} />, 'v-narr')}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            <span className="inline-flex items-center gap-2"><Send className="h-4 w-4" /> {t('save')}</span>
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
