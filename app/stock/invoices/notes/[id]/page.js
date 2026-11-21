'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { ArrowLeft, Printer } from 'lucide-react';
import { amountInWords, computeInvoiceTotals, GST_STATES } from '@/lib/gst-invoice.mjs';
import { formatRupees, useInvoiceText } from '../../../components/invoice-form';
import { CLASSES, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../../../lib/stock-utils';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = (code) => (code ? `${GST_STATES[code] || ''} (${code})` : '—');
const printDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');

/**
 * The printable credit note: the invoice print's layout, titled Credit Note,
 * with the invoice it adjusts and the reason (GST Rule 53). Tax splits follow
 * the original invoice's states.
 */
export default function CreditNotePrintPage() {
  const { id } = useParams();
  const t = useInvoiceText();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [qrSvg, setQrSvg] = useState('');

  useEffect(() => {
    fetch(`/api/stock/notes/${id}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load credit note');
        setData(json);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const signedQr = data?.note?.signed_qr;
  useEffect(() => {
    if (!signedQr) return;
    QRCode.toString(signedQr, { type: 'svg', margin: 1, errorCorrectionLevel: 'L' }).then(setQrSvg).catch(() => setQrSvg(''));
  }, [signedQr]);

  if (error) return <div className={CLASSES.contentWrap}><p className="text-sm text-rose-500">{error}</p></div>;
  if (!data) return <div className={CLASSES.contentWrap} aria-busy="true"><div className="h-9 w-48 skeleton rounded-lg" /><div className="mx-auto h-[70vh] max-w-[210mm] skeleton rounded-xl" /></div>;

  const { note, invoice } = data;
  const business = data.seller?.business || {};
  const totals = computeInvoiceTotals(note.items, business.stateCode, invoice.bill_to_state_code);
  const irnPending = note.status === 'approved' && note.einvoice_status === 'pending';
  const watermark = note.status === 'cancelled' ? t('cancelled') : note.status === 'rejected' ? t('rejected') : irnPending ? t('irnPending') : null;

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

      {note.status === 'pending' ? (
        <p className="rounded-lg bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 print:hidden">{t('noteNotIssuedYet')}</p>
      ) : null}
      {irnPending ? (
        <p className="rounded-lg bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-700 print:hidden">{t('noteIrnPendingHint')}</p>
      ) : null}
      {note.status === 'rejected' ? (
        <p className="rounded-lg bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-700 print:hidden">
          {t('rejectedBecause')} {note.rejection_reason}
        </p>
      ) : null}

      <article className="relative mx-auto w-full max-w-[210mm] overflow-x-auto bg-white p-6 text-slate-900 shadow-sm print:p-0 print:shadow-none">
        {watermark ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-6xl font-black uppercase text-rose-500/20 -rotate-12">
            {watermark}
          </p>
        ) : null}

        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{business.legalName}</h1>
            {business.tradeName && business.tradeName !== business.legalName ? <p className="text-sm">{business.tradeName}</p> : null}
            <p className="mt-1 whitespace-pre-line text-[12px] leading-snug">{business.address}</p>
            <p className="mt-1 text-[12px]"><b>GSTIN:</b> {business.gstin} · <b>State:</b> {state(business.stateCode)}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">{t('creditNoteTitle')}</p>
            <table className="ml-auto mt-1 text-[12px]">
              <tbody>
                <tr><td className="pr-2 text-slate-500">{t('noteNo')}</td><td className="font-semibold">{note.note_number || '—'}</td></tr>
                <tr><td className="pr-2 text-slate-500">{t('date')}</td><td>{printDate(note.note_date_text || note.created_at?.slice(0, 10))}</td></tr>
                <tr><td className="pr-2 text-slate-500">{t('againstInvoice')}</td><td>{note.original_number} · {printDate(note.original_date_text)}</td></tr>
                <tr><td className="pr-2 text-slate-500">{t('reason')}</td><td>{t(`reason_${note.reason}`)}</td></tr>
                <tr><td className="pr-2 text-slate-500">{t('billToState')}</td><td>{state(invoice.bill_to_state_code)}</td></tr>
              </tbody>
            </table>
          </div>
        </header>

        {note.irn ? (
          <p className="mt-2 break-all text-[11px]"><b>IRN:</b> {note.irn} · <b>Ack No:</b> {note.ack_no} · <b>Ack Date:</b> {note.ack_date}</p>
        ) : null}

        <div className="mt-3 border border-slate-300 p-3 text-[13px] leading-snug whitespace-pre-line">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('billTo')}</p>
          <b>{invoice.bill_to_name}</b>
          {invoice.bill_to_address ? `\n${invoice.bill_to_address}` : ''}
          {`\nGSTIN: ${invoice.bill_to_gstin || 'Unregistered'}`}
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
            {note.items.map((item, index) => {
              const line = totals.lines[index];
              return (
                <tr key={`${item.lineIndex}-${index}`} className="align-top">
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
            {note.notes ? <p className="mt-1 whitespace-pre-line"><b>{t('notes')}:</b> {note.notes}</p> : null}
            {note.shipment_number ? <p className="mt-1"><b>{t('dispatchedAs')}:</b> {note.shipment_number}</p> : null}
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
          {/* SVG generated locally by the qrcode library from the portal's signed QR. */}
          {qrSvg ? (
            <div className="text-center">
              <div className="h-32 w-32" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <p className="mt-1 max-w-[8rem] text-[10px] text-slate-500">{t('einvoiceQr')}</p>
            </div>
          ) : <span />}
          <div className="text-right text-[12px]">
            <p>For {business.legalName}</p>
            <p className="mt-10 border-t border-slate-400 pt-1">{t('signatory')}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
