'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { CLASSES, FORM_INPUT_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../../../lib/stock-utils';
import { drCr, useAccountsText } from '../../../components/voucher-form';

/**
 * Ledger statement — also the cash book and bank book. Printable: send it to
 * a customer as their account statement.
 */
export default function LedgerStatementPage() {
  const { id } = useParams();
  const t = useAccountsText();
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const query = new URLSearchParams({ ledgerId: id, ...Object.fromEntries(Object.entries(range).filter(([, v]) => v)) });
    fetch(`/api/stock/accounts/statement?${query}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load statement');
        setData(json);
        setRange((r) => (r.from ? r : { from: json.from, to: json.to }));
      })
      .catch((err) => setError(err.message));
  }, [id, range]);

  if (error) return <div className={CLASSES.contentWrap}><p className="text-sm text-rose-500">{error}</p></div>;
  if (!data) return <div className={CLASSES.contentWrap} aria-busy="true"><div className="h-9 w-48 skeleton rounded-lg" /><div className="mx-auto h-[70vh] max-w-[210mm] skeleton rounded-xl" /></div>;

  return (
    <div className={`${CLASSES.contentWrap} print:max-w-none print:p-0`}>
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <Link href="/stock/accounts" className={PILL_BUTTON_CLASS}><ArrowLeft className="h-3.5 w-3.5" /> {t('title')}</Link>
        <div className="flex flex-wrap items-end gap-2">
          {['from', 'to'].map((key) => (
            <input key={key} type="date" aria-label={t(key)} value={range[key]} onChange={(e) => setRange((r) => ({ ...r, [key]: e.target.value }))} className={`${FORM_INPUT_CLASS} w-40`} />
          ))}
          <button type="button" onClick={() => window.print()} className={PILL_PRIMARY_BUTTON_CLASS}><Printer className="h-3.5 w-3.5" /> Print</button>
        </div>
      </div>

      <article className="paper mx-auto w-full max-w-[210mm] overflow-x-auto bg-white p-6 text-slate-900 shadow-sm print:p-0 print:shadow-none">
        <header className="border-b-2 border-slate-900 pb-2">
          <p className="text-sm">{data.ledger.business_name} · GSTIN {data.ledger.business_gstin}</p>
          <h1 className="text-lg font-bold">{data.ledger.name}</h1>
          <p className="text-xs text-slate-600">{data.ledger.group_name} · {data.from} → {data.to}</p>
        </header>
        <table className="mt-3 w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="border border-slate-300 px-1.5 py-1">{t('date')}</th>
              <th className="border border-slate-300 px-1.5 py-1">{t('type')}</th>
              <th className="border border-slate-300 px-1.5 py-1">{t('number')}</th>
              <th className="border border-slate-300 px-1.5 py-1">{t('narration')}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{t('debit')}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{t('credit')}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{t('balance')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              <td className="border border-slate-300 px-1.5 py-1" colSpan={6}>{t('opening_balance')}</td>
              <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{drCr(data.opening, t)}</td>
            </tr>
            {data.lines.map((line, i) => (
              <tr key={`${line.voucher_id}-${i}`} className="align-top">
                <td className="border border-slate-300 px-1.5 py-1 tabular-nums">{line.date}</td>
                <td className="border border-slate-300 px-1.5 py-1">{t(line.voucher_type)}</td>
                <td className="border border-slate-300 px-1.5 py-1">{line.voucher_number}</td>
                <td className="border border-slate-300 px-1.5 py-1">
                  {line.narration}{line.bill_ref ? ` · ${line.bill_ref}` : ''}{line.instrument_no ? ` · ${line.instrument_no}` : ''}
                </td>
                <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{line.amount > 0 ? line.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
                <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{line.amount < 0 ? (-line.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
                <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{drCr(line.balance, t)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-slate-300 px-1.5 py-1" colSpan={6}>{t('closing_balance')}</td>
              <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{drCr(data.closing, t)}</td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  );
}
