'use client';
import { SelectField } from '@/components/ui/select';

// Credit and debit notes on the Invoices page: the "raise" sheet and the list.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, ExternalLink, X } from 'lucide-react';
import { computeInvoiceTotals } from '@/lib/gst-invoice.mjs';
import { CUSTOMER_DEBIT_REASONS, NOTE_REASONS, withQtyRate } from '@/lib/notes.mjs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatRupees } from './invoice-form';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, formatDateTime, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';

export const STATUS_TONE = {
  pending: 'bg-muted text-amber-700 dark:text-amber-400',
  approved: 'bg-muted text-emerald-700 dark:text-emerald-400',
  dispatched: 'bg-muted text-sky-700 dark:text-sky-400',
  rejected: 'bg-muted text-rose-700 dark:text-rose-400',
  cancelled: 'bg-slate-500/10 text-slate-500',
};

async function readJson(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || json.detail || 'Request failed');
  return json;
}

/**
 * request opens the sheet:
 *   { invoiceId, shipmentId? }  credit note; from a dispatch return its quantities are prefilled
 *   { invoiceId, kind: 'debit' } debit note to the customer: an extra rate on billed quantity
 *   { purchaseId }               debit note to the supplier: goods sent back or a claim
 */
export function NoteSheet({ request, onClose, onSaved, t }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState('sales_return');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!request) return undefined;
    let cancelled = false;
    setData(null);
    setError('');
    setNotes('');
    setReason(request.kind === 'debit' ? 'rate_correction' : request.shipmentId || request.purchaseId ? 'sales_return' : 'post_sale_discount');
    const query = new URLSearchParams(request.purchaseId
      ? { purchaseId: request.purchaseId }
      : { invoiceId: request.invoiceId, ...(request.kind ? { kind: request.kind } : {}), ...(request.shipmentId ? { shipmentId: request.shipmentId } : {}) });
    fetch(`/api/stock/notes?${query}`, { cache: 'no-store' })
      .then(readJson)
      .then((json) => {
        if (cancelled) return;
        setData(json);
        const adds = json.kind === 'debit' && json.original.partyKind === 'customer';
        // Taking value off: the billed rate to start from. Adding: the extra rate, typed in.
        setRows(json.lines.map((line) => ({ qty: line.prefillQty ? String(line.prefillQty) : '', rate: adds ? '' : String(line.rate) })));
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [request]);

  const picked = useMemo(() => (data?.lines || [])
    .map((line, index) => ({ line, qty: Number(rows[index]?.qty) || 0, rate: Number(rows[index]?.rate) || 0 }))
    .filter((row) => row.qty > 0), [data, rows]);
  const totals = useMemo(() => computeInvoiceTotals(
    picked.map(({ line, qty, rate }) => ({ ...withQtyRate({ itemCategory: line.itemCategory }, qty, rate), gstRate: line.gstRate })),
    data?.original.sellerState,
    data?.original.buyerState
  ), [picked, data]);
  const adds = data?.kind === 'debit' && data?.original.partyKind === 'customer';
  const supplier = data?.original.partyKind === 'supplier';

  const setRow = (index, key, value) => setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const json = await readJson(await fetch('/api/stock/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(request.purchaseId ? { inboundShipmentId: request.purchaseId } : { salesInvoiceId: request.invoiceId, kind: request.kind || 'credit' }),
          outboundShipmentId: request.shipmentId || null,
          reason,
          notes,
          lines: picked.map(({ line, qty, rate }) => ({ lineIndex: line.lineIndex, qty, rate })),
        }),
      }));
      onSaved(json.message || t('creditNoteSaved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const returnedFrom = request?.shipmentId && data?.lines.some((line) => line.prefillQty > 0);

  return (
    <Sheet open={Boolean(request)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[80vw] lg:w-[70vw] xl:w-[62vw] md:max-w-[1100px]">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="text-base">
            {data
              ? t(data.kind === 'debit' ? 'debitNoteFor' : 'creditNoteFor', { number: data.original.number })
              : t(request?.kind === 'debit' || request?.purchaseId ? 'debitNote' : 'creditNote')}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {data ? `${data.original.partyName || '—'} · ${formatRupees(data.original.total)}. ` : ''}
            {t(adds ? 'debitNoteDesc' : supplier ? 'supplierDebitNoteDesc' : 'creditNoteDesc')}
          </SheetDescription>
        </SheetHeader>

        {!data ? (
          <p className={`mt-6 text-sm ${error ? 'text-rose-500' : 'text-slate-400'}`}>{error || '…'}</p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            {returnedFrom ? (
              <p className="rounded-lg bg-muted px-4 py-2 text-sm text-sky-700 dark:text-sky-300">
                {t('prefilledFromReturn', { dispatch: data.shipmentNumber })}
              </p>
            ) : null}

            <label className="block max-w-xs">
              <span className={FORM_LABEL_CLASS}>{t('reason')}</span>
              <SelectField value={reason} onChange={(e) => setReason(e.target.value)} className={FORM_INPUT_CLASS}>
                {(adds ? CUSTOMER_DEBIT_REASONS : NOTE_REASONS).map((key) => <option key={key} value={key}>{t(`reason_${key}`)}</option>)}
              </SelectField>
            </label>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-2 pr-4">{t('description')}</th>
                    <th className="py-2 pr-4 text-right">{t('billed')}</th>
                    {adds ? null : <th className="py-2 pr-4 text-right">{t('leftToCredit')}</th>}
                    <th className="py-2 pr-4">{t('creditQty')}</th>
                    <th className="py-2 pr-4">{t(adds ? 'extraRate' : 'creditRate')}</th>
                    <th className="py-2 text-right">{t('taxable')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.lines.map((line, index) => (
                    <tr key={line.lineIndex} className="align-middle">
                      <td className="py-2 pr-4">{line.itemLabel}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{line.billedQty} {line.unit} @ {formatRupees(line.rate)}</td>
                      {adds ? null : (
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {line.leftQty} {line.unit} · {formatRupees(line.leftValue)}
                          {supplier ? <span className="block text-xs text-slate-500">{t('leftToReturn', { qty: line.leftToReturn, unit: line.unit })}</span> : null}
                        </td>
                      )}
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          min="0"
                          step={line.itemCategory === 'stone' ? '0.001' : '1'}
                          max={line.billedQty}
                          value={rows[index]?.qty ?? ''}
                          onChange={(e) => setRow(index, 'qty', e.target.value)}
                          className={`${FORM_INPUT_CLASS} w-28`}
                          aria-label={`${t('creditQty')} ${line.itemLabel}`}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={adds ? undefined : line.rate}
                          value={rows[index]?.rate ?? ''}
                          onChange={(e) => setRow(index, 'rate', e.target.value)}
                          className={`${FORM_INPUT_CLASS} w-28`}
                          aria-label={`${t('creditRate')} ${line.itemLabel}`}
                        />
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatRupees((Number(rows[index]?.qty) || 0) * (Number(rows[index]?.rate) || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm tabular-nums">
              <span>{t('taxable')}: {formatRupees(totals.taxableTotal)}</span>
              {totals.interState
                ? <span>{t('igst')}: {formatRupees(totals.igst)}</span>
                : <span>{t('cgst')} + {t('sgst')}: {formatRupees(totals.cgst + totals.sgst)}</span>}
              <span className="font-semibold">{t('grandTotal')}: {formatRupees(totals.grandTotal)}</span>
            </div>

            <label className="block">
              <span className={FORM_LABEL_CLASS}>{t('notes')}</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className={FORM_INPUT_CLASS} />
            </label>

            {error ? <p className="text-sm text-rose-500">{error}</p> : null}
            <button type="submit" disabled={submitting || !picked.length} className={PILL_PRIMARY_BUTTON_CLASS}>
              {submitting ? t('submitting') : t('submitEstimate')}
            </button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Mirrors the server: another approver approves; the maker or an approver drops a pending note, another approver voids an issued one. */
function noteRights(note, accessUser, isApprover) {
  const me = Number(accessUser?.id);
  const own = [note.created_by_user_id, note.salesperson_user_id].map(Number).includes(me);
  return {
    review: isApprover && !own && note.status === 'pending',
    cancel: note.status === 'pending' ? Number(note.created_by_user_id) === me || isApprover : note.status === 'approved' && isApprover && !own,
  };
}

export function NotesList({ notes, accessUser, isApprover, busyId, onAct, setReasonDialog, t }) {
  if (!notes.length) return <p className="py-8 text-center text-sm text-slate-400">{t('noNotes')}</p>;
  return (
    <ul className="divide-y divide-border">
      {notes.map((note) => {
        const rights = noteRights(note, accessUser, isApprover);
        const busy = busyId === `note-${note.id}`;
        const label = note.note_number || `${t(note.kind === 'debit' ? 'debitNote' : 'creditNote')} #${note.id}`;
        return (
          <li key={note.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4">
            <div className="min-w-[12rem] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{label}</span>
                <span className={`rounded-lg px-2 py-1 text-xs font-medium ${STATUS_TONE[note.status]}`}>{t(note.status)}</span>
                {note.status === 'approved' && note.einvoice_status === 'pending' ? (
                  <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-rose-700 dark:text-rose-400">{t('irnPending')}</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {note.kind === 'debit' ? `${t('debitNote')} · ` : ''}{note.party_name} · {t(note.party_kind === 'supplier' ? 'againstPurchase' : 'againstInvoice')} {note.original_number}
              </p>
              <p className="text-xs text-slate-500">
                {t(`reason_${note.reason}`)}{note.shipment_number ? ` · ${note.shipment_number}` : ''} · {note.created_by_name || '—'} · {formatDateTime(note.created_at)}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums">{formatRupees(note.grand_total)}</span>
            <div className="flex flex-wrap gap-2">
              <Link href={`/stock/invoices/notes/${note.id}`} className={PILL_BUTTON_CLASS}>
                <ExternalLink className="h-3.5 w-3.5" /> {t('open')}
              </Link>
              {rights.review ? (
                <>
                  <button type="button" disabled={busy} onClick={() => onAct(note, 'approve')} className={PILL_PRIMARY_BUTTON_CLASS}>
                    <Check className="h-3.5 w-3.5" /> {t('approve')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={PILL_BUTTON_CLASS}
                    onClick={() => setReasonDialog({
                      title: t('reject'),
                      description: `${note.party_name} · ${formatRupees(note.grand_total)}`,
                      placeholder: t('rejectNoteReason'),
                      required: true,
                      confirmText: t('reject'),
                      tone: 'rose',
                      onSubmit: (reason) => onAct(note, 'reject', { reason }),
                    })}
                  >
                    <X className="h-3.5 w-3.5" /> {t('reject')}
                  </button>
                </>
              ) : null}
              {rights.cancel ? (
                <button
                  type="button"
                  disabled={busy}
                  className={PILL_BUTTON_CLASS}
                  onClick={() => setReasonDialog({
                    title: t('cancel'),
                    description: `${label} · ${t('cancelNoteConfirm')}`,
                    placeholder: t('notes'),
                    confirmText: t('cancel'),
                    tone: 'rose',
                    onSubmit: () => onAct(note, 'cancel'),
                  })}
                >
                  <Ban className="h-3.5 w-3.5" /> {t('cancel')}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
