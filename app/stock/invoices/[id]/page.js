'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { ArrowLeft, Printer } from 'lucide-react';
import { amountInWords, computeInvoiceTotals, GST_STATES } from '@/lib/gst-invoice.mjs';
import { formatRupees, invoiceStatus, useInvoiceText } from '../../components/invoice-form';
import { CLASSES, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../../lib/stock-utils';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = (code) => (code ? `${GST_STATES[code] || ''} (${code})` : '—');

/** "2026-10-06" → "06-10-2026", the way Indian invoices print dates. */
const printDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');

function Party({ label, children }) {
  return (
    <div className="min-w-0 flex-1 border border-slate-300 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 whitespace-pre-line text-[13px] leading-snug">{children}</div>
    </div>
  );
}

/**
 * The printable estimate / tax invoice. Before approval it is an ESTIMATE with
 * no number and no QR. Once approved it is a TAX INVOICE carrying the fields
 * GST Rule 46 asks for, plus a QR that opens the dispatch form prefilled — a
 * phone's own camera reads it, no in-app scanner needed. Save as PDF is the
 * browser's print dialog; the layout hides its sidebar and topbar in print.
 */
export default function InvoicePrintPage() {
  const { id } = useParams();
  const t = useInvoiceText();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // dispatch: opens the prefilled dispatch form; einvoice: the portal's signed
  // QR (mandatory on B2B once there is an IRN); upi: lets the customer pay.
  const [qr, setQr] = useState({});

  useEffect(() => {
    fetch(`/api/stock/sales-invoices/${id}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load invoice');
        setData(json);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const invoice = data?.invoice;
  const issued = invoice?.status === 'approved';

  const upiId = data?.seller?.business?.upiId;
  useEffect(() => {
    if (!issued) return;
    const svg = (text, errorCorrectionLevel = 'M') =>
      QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel }).catch(() => '');
    const upiLink = upiId
      ? `upi://pay?${new URLSearchParams({ pa: upiId, pn: data.seller.business.legalName, am: Number(invoice.grand_total).toFixed(2), cu: 'INR', tn: invoice.invoice_number })}`
      : null;
    Promise.all([
      svg(`${window.location.origin}/stock?new=dispatch&invoice=${invoice.id}`),
      // The signed QR is a long JWT; low error correction keeps it scannable.
      invoice.signed_qr ? svg(invoice.signed_qr, 'L') : '',
      upiLink ? svg(upiLink) : '',
    ]).then(([dispatch, einvoice, upi]) => setQr({ dispatch, einvoice, upi }));
  }, [issued, invoice, upiId, data]);

  if (error) return <div className={CLASSES.contentWrap}><p className="text-sm text-rose-500">{error}</p></div>;
  if (!invoice) return <div className={CLASSES.contentWrap}><p className="text-sm text-slate-400">…</p></div>;

  const business = data.seller?.business || {};
  const branch = data.seller?.location || {};
  const totals = computeInvoiceTotals(invoice.items, business.stateCode, invoice.bill_to_state_code);
  const status = invoiceStatus(invoice);
  const title = issued || status === 'dispatched' ? t('taxInvoice') : t('estimate');
  const irnPending = issued && invoice.einvoice_status === 'pending';

  return (
    <div className={`${CLASSES.contentWrap} print:max-w-none print:p-0`}>
      <style>{'@page { size: A4; margin: 10mm; }'}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/stock/invoices" className={PILL_BUTTON_CLASS}>
          <ArrowLeft className="h-3.5 w-3.5" /> {t('back')}
        </Link>
        <button type="button" onClick={() => window.print()} className={PILL_PRIMARY_BUTTON_CLASS}>
          <Printer className="h-3.5 w-3.5" /> {t('print')}
        </button>
      </div>

      {invoice.status === 'pending' ? (
        <p className="rounded-lg bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 print:hidden">{t('notApprovedYet')}</p>
      ) : null}
      {irnPending ? (
        <p className="rounded-lg bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-700 print:hidden">{t('irnPendingHint')}</p>
      ) : null}
      {invoice.status === 'rejected' ? (
        <p className="rounded-lg bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-700 print:hidden">
          {t('rejectedBecause')} {invoice.rejection_reason}
        </p>
      ) : null}

      {/* Paper: always black on white, also in dark mode, so screen and PDF match. */}
      <article className="relative mx-auto w-full max-w-[210mm] overflow-x-auto bg-white p-6 text-slate-900 shadow-sm print:p-0 print:shadow-none">
        {invoice.status === 'cancelled' || irnPending ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-6xl font-black uppercase text-rose-500/20 -rotate-12">
            {invoice.status === 'cancelled' ? t('cancelled') : t('irnPending')}
          </p>
        ) : null}

        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{business.legalName}</h1>
            {business.tradeName && business.tradeName !== business.legalName ? <p className="text-sm">{business.tradeName}</p> : null}
            <p className="mt-1 whitespace-pre-line text-[12px] leading-snug">{business.address}</p>
            <p className="mt-1 text-[12px]">
              <b>GSTIN:</b> {business.gstin} · <b>State:</b> {state(business.stateCode)}
            </p>
            {business.phone || business.email ? (
              <p className="text-[12px]">{[business.phone, business.email].filter(Boolean).join(' · ')}</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">{title}</p>
            <table className="ml-auto mt-1 text-[12px]">
              <tbody>
                <tr><td className="pr-2 text-slate-500">{t('invoiceNo')}</td><td className="font-semibold">{invoice.invoice_number || '—'}</td></tr>
                <tr><td className="pr-2 text-slate-500">{t('date')}</td><td>{printDate(invoice.invoice_date_text || invoice.created_at?.slice(0, 10))}</td></tr>
                <tr><td className="pr-2 text-slate-500">{t('billToState')}</td><td>{state(invoice.bill_to_state_code)}</td></tr>
              </tbody>
            </table>
            <p className="mt-1 text-[11px]">{t('reverseCharge')}</p>
          </div>
        </header>

        {invoice.irn ? (
          <p className="mt-2 break-all text-[11px]">
            <b>IRN:</b> {invoice.irn} · <b>Ack No:</b> {invoice.ack_no} · <b>Ack Date:</b> {invoice.ack_date}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Party label={t('billTo')}>
            <b>{invoice.bill_to_name}</b>
            {invoice.bill_to_address ? `\n${invoice.bill_to_address}` : ''}
            {invoice.bill_to_phone ? `\n${invoice.bill_to_phone}` : ''}
            {`\nGSTIN: ${invoice.bill_to_gstin || 'Unregistered'}`}
          </Party>
          <Party label={t('shipTo')}>{invoice.ship_to_address || invoice.bill_to_address || '—'}</Party>
          <Party label={t('from')}>
            <b>{branch.name}</b>
            {branch.address ? `\n${branch.address}` : ''}
            {invoice.salesperson_name ? `\n${t('salesperson')}: ${invoice.salesperson_name}` : ''}
          </Party>
        </div>

        <table className="mt-3 w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="border border-slate-300 px-1.5 py-1">#</th>
              <th className="border border-slate-300 px-1.5 py-1">{t('description')}</th>
              <th className="border border-slate-300 px-1.5 py-1">{t('hsn')}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{t('qty')}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{t('rate')}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{t('taxable')}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{t('gst')}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{totals.interState ? t('igst') : `${t('cgst')} + ${t('sgst')}`}</th>
              <th className="border border-slate-300 px-1.5 py-1 text-right">{t('amount')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => {
              const line = totals.lines[index];
              return (
                <tr key={`${item.itemId}-${index}`} className="align-top">
                  <td className="border border-slate-300 px-1.5 py-1">{index + 1}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{item.itemLabel}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{item.hsnCode}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{line.qty} {line.unit}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{fmt(line.rate)}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{fmt(line.taxable)}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{line.gstRate}%</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">
                    {totals.interState ? fmt(line.igst) : `${fmt(line.cgst)} + ${fmt(line.sgst)}`}
                  </td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums">{fmt(line.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 text-[12px]">
            <p className="mb-1 font-semibold">{amountInWords(totals.grandTotal)}</p>
            {business.bankAccount ? (
              <p>
                <b>{t('bank')}:</b> {[business.bankName, `A/c ${business.bankAccount}`, business.bankIfsc && `IFSC ${business.bankIfsc}`].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            {invoice.notes ? <p className="mt-1 whitespace-pre-line"><b>{t('notes')}:</b> {invoice.notes}</p> : null}
            {invoice.dispatch_number ? <p className="mt-1"><b>{t('dispatchedAs')}:</b> {invoice.dispatch_number}</p> : null}
          </div>
          <table className="text-[13px] tabular-nums">
            <tbody>
              <tr><td className="pr-6">{t('taxable')}</td><td className="text-right">{formatRupees(totals.taxableTotal)}</td></tr>
              {totals.interState ? (
                <tr><td className="pr-6">{t('igst')}</td><td className="text-right">{formatRupees(totals.igst)}</td></tr>
              ) : (
                <>
                  <tr><td className="pr-6">{t('cgst')}</td><td className="text-right">{formatRupees(totals.cgst)}</td></tr>
                  <tr><td className="pr-6">{t('sgst')}</td><td className="text-right">{formatRupees(totals.sgst)}</td></tr>
                </>
              )}
              <tr className="border-t-2 border-slate-900 font-bold">
                <td className="pr-6 pt-1">{t('grandTotal')}</td><td className="pt-1 text-right">{formatRupees(totals.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer className="mt-6 flex flex-wrap items-end justify-between gap-4 break-inside-avoid">
          <div className="flex flex-wrap gap-4">
            {/* SVGs generated locally by the qrcode library from our own data. */}
            {[
              ['einvoice', t('einvoiceQr')],
              ['upi', t('scanToPay')],
              ['dispatch', t('scanToDispatch')],
            ].filter(([key]) => qr[key]).map(([key, caption]) => (
              <div key={key} className="text-center">
                <div className={key === 'einvoice' ? 'h-32 w-32' : 'h-28 w-28'} dangerouslySetInnerHTML={{ __html: qr[key] }} />
                <p className="mt-1 max-w-[8rem] text-[10px] text-slate-500">{caption}</p>
              </div>
            ))}
          </div>
          <div className="text-right text-[12px]">
            <p>For {business.legalName}</p>
            <p className="mt-10 border-t border-slate-400 pt-1">{t('signatory')}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
