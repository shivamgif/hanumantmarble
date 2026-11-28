'use client';

import { Paper } from '../../components/paper';
import { PageSkeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { amountInWords, computeInvoiceTotals, GST_STATES, inclusiveRate, isCharge, PLACEHOLDER_GSTIN } from '@/lib/gst-invoice.mjs';
import { useInvoiceText } from '../../components/invoice-form';
import { InvoiceHistory } from '../../components/invoice-history';
import { CLASSES, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../../lib/stock-utils';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
/** 'Rupees Nine … Only' → 'INR Nine … Only', as Tally prints it. */
const inr = (amount) => amountInWords(amount).replace(/^Rupees /, 'INR ');

/** "2026-10-06" → "06-10-2026", the way Indian invoices print dates. */
const printDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

/** One labelled box of the header grid, Tally style: small label, bold value. */
function Cell({ label, children, className = '' }) {
  return (
    <div className={`min-h-[2.4rem] border-b border-l border-black px-1.5 py-0.5 ${className}`}>
      <p className="text-[10px] leading-tight">{label}</p>
      <p className="font-bold leading-tight">{children}</p>
    </div>
  );
}

/**
 * The printable estimate / tax invoice, laid out like a Tally GST invoice:
 * seller / consignee / buyer on the left, reference boxes on the right, the
 * goods table with tax and round-off rows, an HSN-wise tax summary, then
 * declaration, bank details and signatory. Before approval it is an ESTIMATE
 * with no number and no QR. Once approved it is a TAX INVOICE carrying the
 * fields GST Rule 46 asks for, plus a QR that opens the dispatch form
 * prefilled. Save as PDF is the browser's print dialog; the layout hides its
 * sidebar and topbar in print.
 */
export default function InvoicePrintPage() {
  const { id } = useParams();
  const t = useInvoiceText();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // dispatch: opens the prefilled dispatch form; einvoice: the portal's signed
  // QR (mandatory on B2B once there is an IRN); upi: lets the customer pay.
  const [qr, setQr] = useState({});
  // Logo (printed only once uploaded in Settings → Company) and invoice terms.
  const [company, setCompany] = useState(null);
  const companyLogo = company?.hasUploadedLogo ? company.logo : null;

  useEffect(() => {
    fetch('/api/stock/company', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setCompany(json?.company || null))
      .catch(() => setCompany(null));
  }, []);

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
  // A live proforma: the customer may pay an advance against it, so it gets the UPI QR too.
  const proformaOut = invoice?.status === 'pending' && Boolean(invoice?.proforma_number);

  const upiId = data?.seller?.business?.upiId;
  useEffect(() => {
    if (!issued && !proformaOut) return;
    // Loaded here, not at the top: only issued invoices and live proformas draw QRs.
    const qrcode = import('qrcode');
    const svg = (text, errorCorrectionLevel = 'M') =>
      qrcode.then((m) => m.default.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel })).catch(() => '');
    const upiLink = upiId && Number(invoice.grand_total) > (Number(invoice.advance_amount) || 0)
      ? `upi://pay?${new URLSearchParams({ pa: upiId, pn: data.seller.business.legalName, am: (Number(invoice.grand_total) - (Number(invoice.advance_amount) || 0)).toFixed(2), cu: 'INR', tn: invoice.invoice_number || invoice.proforma_number })}`
      : null;
    Promise.all([
      issued ? svg(`${window.location.origin}/stock?new=dispatch&invoice=${invoice.id}`) : '',
      // The signed QR is a long JWT; low error correction keeps it scannable.
      invoice.signed_qr ? svg(invoice.signed_qr, 'L') : '',
      upiLink ? svg(upiLink) : '',
    ]).then(([dispatch, einvoice, upi]) => setQr({ dispatch, einvoice, upi }));
  }, [issued, proformaOut, invoice, upiId, data]);

  if (error) return <div className={CLASSES.contentWrap}><p className="text-sm text-rose-500">{error}</p></div>;
  if (!invoice) return <PageSkeleton />;

  const business = data.seller?.business || {};
  const branch = data.seller?.location || {};
  // Where the sale was made: a showroom prints as one; anything else as Tally's "Godown".
  const branchLabel = invoice.location_type === 'showroom' ? t('showroom') : t('godown');
  const totals = computeInvoiceTotals(invoice.items, business.stateCode, invoice.bill_to_state_code);
  // A number is only ever given on approval: no number = an estimate, never a
  // sale. A proforma is an estimate an approver has issued as a numbered offer.
  const isEstimate = !invoice.invoice_number;
  const isProforma = isEstimate && Boolean(invoice.proforma_number);
  const proformaRef = invoice.proforma_number
    ? `${invoice.proforma_number}${invoice.proforma_rev ? ` (${t('rev')} ${invoice.proforma_rev})` : ''}`
    : '';
  const title = isProforma ? t('proformaInvoice') : isEstimate ? t('estimate') : t('taxInvoice');
  const irnPending = issued && invoice.einvoice_status === 'pending';
  const watermark = invoice.status === 'cancelled' ? t('cancelled')
    : irnPending ? t('irnPending')
      : isEstimate && !isProforma ? t('estimate') : null;
  // The seeded business has a placeholder GSTIN in another state, so every
  // local sale comes out as IGST until the real one is entered.
  const missingSetup = [
    business.gstin === PLACEHOLDER_GSTIN && t('gstinUin'),
    !business.bankAccount && t('bankDetails'),
    company && !company.invoiceTerms && t('declaration'),
  ].filter(Boolean);

  const taxTotal = round2(totals.cgst + totals.sgst + totals.igst);
  // An invoice issued before whole-rupee rounding keeps the total it was
  // registered (and posted) with, so a reprint never disagrees with the books.
  // An estimate is always worked out afresh: its seller's state may have been
  // corrected since it was saved, and approval recomputes it the same way.
  const grandTotal = !isEstimate && invoice.grand_total != null ? Number(invoice.grand_total) : totals.grandTotal;
  const roundOff = round2(grandTotal - totals.taxableTotal - taxTotal);
  const advance = Number(invoice.advance_amount) || 0;
  const balanceDue = round2(grandTotal - advance);

  // Tax rows under the goods ("CGST @9%"), one per GST rate on the bill.
  const byRate = {};
  totals.lines.forEach((line) => {
    const row = (byRate[line.gstRate] ??= { cgst: 0, sgst: 0, igst: 0 });
    row.cgst += line.cgst; row.sgst += line.sgst; row.igst += line.igst;
  });
  const taxRows = Object.entries(byRate).flatMap(([rate, sums]) => (totals.interState
    ? [[t('igst'), Number(rate), sums.igst]]
    : [[t('cgst'), rate / 2, sums.cgst], [t('sgst'), rate / 2, sums.sgst]]
  )).filter(([, , amount]) => amount);

  // HSN-wise tax summary, as Rule 46 and Tally print it.
  const hsnRows = Object.values(totals.lines.reduce((acc, line, index) => {
    const hsn = invoice.items[index].hsnCode || '';
    const row = (acc[`${hsn}|${line.gstRate}`] ??= { hsn, rate: line.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    row.taxable += line.taxable; row.cgst += line.cgst; row.sgst += line.sgst; row.igst += line.igst;
    return acc;
  }, {}));

  // Goods first with their subtotal; charges (cartage) under it, as Tally prints them.
  const rows = invoice.items.map((item, index) => ({ item, line: totals.lines[index] }));
  const goodsRows = rows.filter(({ item }) => !isCharge(item));
  const chargeRows = rows.filter(({ item }) => isCharge(item));
  const goodsTaxable = round2(goodsRows.reduce((sum, { line }) => sum + line.taxable, 0));

  // Total quantity only when every goods line is in the same unit (7.00 box).
  const units = new Set(goodsRows.map(({ line }) => line.unit));
  const totalQty = units.size === 1 ? `${fmt(goodsRows.reduce((sum, { line }) => sum + line.qty, 0))} ${[...units][0]}` : '';

  const stateLine = (code) => (code ? `${t('stateName')} : ${GST_STATES[code] || ''}, ${t('code')} : ${code}` : '');
  const th = 'border-b border-r border-black px-1 py-0.5 font-normal last:border-r-0';
  const td = 'border-r border-black px-1 last:border-r-0';

  return (
    <div className={`${CLASSES.contentWrap} print:max-w-none print:p-0`}>
      <style>{'@page { size: A4; margin: 8mm; }'}</style>

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
      {missingSetup.length ? (
        <p className="rounded-lg bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 print:hidden">
          {t('sellerSetupMissing', { missing: missingSetup.join(', ') })}
        </p>
      ) : null}

      {/* Paper: always black on white, also in dark mode, so screen and PDF match. */}
      <Paper className="relative text-[11px] leading-snug text-black">
        {watermark ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-6xl font-black uppercase text-rose-500/20 -rotate-12">
            {watermark}
          </p>
        ) : null}

        {/* Above the box: IRN on the left, title in the middle, copy marker and e-invoice QR on the right. */}
        <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div className="min-w-0 break-all text-[10px]">
            {invoice.irn ? (
              <table>
                <tbody>
                  <tr><td className="pr-1 align-top">IRN</td><td className="pr-1 align-top">:</td><td>{invoice.irn}</td></tr>
                  <tr><td className="pr-1">Ack No.</td><td className="pr-1">:</td><td>{invoice.ack_no}</td></tr>
                  <tr><td className="pr-1">Ack Date</td><td className="pr-1">:</td><td>{invoice.ack_date}</td></tr>
                </tbody>
              </table>
            ) : null}
          </div>
          <h1 className="text-[15px] font-bold">{title}</h1>
          <div className="flex items-end justify-end gap-2 text-right text-[10px]">
            {isProforma ? (
              <p className="font-semibold">{t('validUntil')} : {printDate(invoice.proforma_valid_until_text)}</p>
            ) : isEstimate ? null : (
              <div>
                <p className="italic">{t('originalForRecipient')}</p>
                <p>{t('reverseCharge')}</p>
              </div>
            )}
            {qr.einvoice ? (
              <div className="text-center">
                <p className="font-semibold">e-Invoice</p>
                {/* SVG generated locally by the qrcode library from the portal's signed QR. */}
                <div className="h-28 w-28" dangerouslySetInnerHTML={{ __html: qr.einvoice }} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="border border-black">
          {/* Parties on the left, reference boxes on the right. */}
          <div className="grid grid-cols-2">
            <div>
              <div className="flex gap-2 border-b border-black p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed-in API image, see CompanyMark */}
                {companyLogo ? <img src={companyLogo} alt="" className="h-14 w-14 shrink-0 object-contain" /> : null}
                <div className="min-w-0">
                  <p className="text-[13px] font-bold">{business.legalName}</p>
                  {business.tradeName && business.tradeName !== business.legalName ? <p>{business.tradeName}</p> : null}
                  <p className="whitespace-pre-line">{business.address}</p>
                  <p>{t('gstinUin')} : {business.gstin}</p>
                  <p>{stateLine(business.stateCode)}</p>
                  {business.phone ? <p>{t('contact')} : {business.phone}</p> : null}
                  {business.email ? <p>{t('email')} : {business.email}</p> : null}
                </div>
              </div>
              <div className="border-b border-black p-1.5">
                <p className="text-[10px]">{t('consignee')}</p>
                <p className="font-bold">{invoice.bill_to_name}</p>
                <p className="whitespace-pre-line">{invoice.ship_to_address || invoice.bill_to_address}</p>
                {invoice.ship_to_pincode ? <p>PIN : {invoice.ship_to_pincode}</p> : null}
                <p>{t('gstinUin')} : {invoice.bill_to_gstin || t('unregistered')}</p>
                <p>{stateLine(invoice.bill_to_state_code)}</p>
              </div>
              <div className="p-1.5">
                <p className="text-[10px]">{t('buyer')}</p>
                <p className="font-bold">{invoice.bill_to_name}</p>
                <p className="whitespace-pre-line">{invoice.bill_to_address}</p>
                {invoice.bill_to_city || invoice.bill_to_pincode ? <p>{[invoice.bill_to_city, invoice.bill_to_pincode].filter(Boolean).join(' - ')}</p> : null}
                {invoice.bill_to_phone ? <p>{t('contact')} : {invoice.bill_to_phone}</p> : null}
                <p>{t('gstinUin')} : {invoice.bill_to_gstin || t('unregistered')}</p>
                <p>{stateLine(invoice.bill_to_state_code)}</p>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="grid grid-cols-2">
                <Cell label={isProforma ? t('proformaNo') : t('invoiceNo')}>{isProforma ? proformaRef : invoice.invoice_number || '—'}</Cell>
                <Cell label={t('dated')}>
                  {printDate(isProforma ? invoice.proforma_date_text : invoice.invoice_date_text || invoice.created_at?.slice(0, 10))}
                </Cell>
                <Cell label={t('deliveryNote')}>{invoice.dispatch_number}</Cell>
                <Cell label={t('paymentTerms')} />
                {/* The tax invoice names the proforma it fulfils. */}
                <Cell label={t('referenceNo')}>
                  {!isEstimate && invoice.proforma_number ? `${proformaRef} dt ${printDate(invoice.proforma_date_text)}` : null}
                </Cell>
                <Cell label={t('otherReferences')} />
                <Cell label={t('buyersOrder')} />
                <Cell label={t('vehicleNo')}>{invoice.dispatch_vehicle_number}</Cell>
                <Cell label={t('dispatchedThrough')} />
                <Cell label={t('destination')}>{invoice.bill_to_city}</Cell>
                <Cell label={t('salesperson')} className="col-span-2">
                  {invoice.salesperson_name}{invoice.salesperson_phone ? ` (${invoice.salesperson_phone})` : ''}
                </Cell>
              </div>
              <div className="flex-1 border-l border-black px-1.5 py-0.5">
                <p className="text-[10px]">{t('termsOfDelivery')}</p>
              </div>
            </div>
          </div>

          {/* Goods: vertical rules only, tax and round-off rows under the items, as Tally prints them. */}
          <table className="w-full border-collapse border-t border-black">
            <thead>
              <tr className="text-center align-top">
                <th className={`${th} w-7`}>{t('slNo')}</th>
                <th className={th}>{t('goods')}</th>
                <th className={th}>{t('hsnSac')}</th>
                <th className={th}>{t('gstRate')}</th>
                <th className={th}>{t('quantity')}</th>
                <th className={th}>{t('rate')}</th>
                <th className={th}>{t('rateInclTax')}</th>
                <th className={th}>{t('per')}</th>
                <th className={th}>{t('amount')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {goodsRows.map(({ item, line }, index) => {
                return (
                  <tr key={`${item.itemId}-${index}`} className="break-inside-avoid align-top">
                    <td className={`${td} pt-1 text-right`}>{index + 1}</td>
                    <td className={`${td} pt-1`}>
                      <p className="font-bold">{item.itemLabel}</p>
                      {branch.name ? <p className="pl-2 text-[10px] italic">{branchLabel} : {branch.name}</p> : null}
                    </td>
                    <td className={`${td} pt-1`}>{item.hsnCode}</td>
                    <td className={`${td} pt-1 text-right`}>{line.gstRate} %</td>
                    <td className={`${td} pt-1 text-right font-bold`}>{fmt(line.qty)} {line.unit}</td>
                    <td className={`${td} pt-1 text-right`}>{fmt(line.rate)}</td>
                    <td className={`${td} pt-1 text-right`}>{fmt(inclusiveRate(line.rate, line.gstRate))}</td>
                    <td className={`${td} pt-1`}>{line.unit}</td>
                    <td className={`${td} pt-1 text-right font-bold`}>{fmt(line.taxable)}</td>
                  </tr>
                );
              })}
              <tr>
                <td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} />
                <td className={td} /><td className={td} /><td className={td} />
                <td className={`${td} text-right`}><span className="inline-block border-t border-black pt-0.5">{fmt(goodsTaxable)}</span></td>
              </tr>
              {chargeRows.map(({ item, line }, index) => (
                <tr key={`charge-${index}`}>
                  <td className={td} />
                  <td className={`${td} text-right font-bold italic`}>{item.itemLabel}</td>
                  <td className={td}>{item.hsnCode}</td>
                  <td className={`${td} text-right`}>{line.gstRate} %</td>
                  <td className={td} /><td className={td} /><td className={td} /><td className={td} />
                  <td className={`${td} text-right font-bold`}>{fmt(line.taxable)}</td>
                </tr>
              ))}
              {taxRows.map(([name, rate, amount]) => (
                <tr key={`${name}-${rate}`}>
                  <td className={td} />
                  <td className={`${td} text-right font-bold italic`}>{name} @{rate}%</td>
                  <td className={td} /><td className={td} /><td className={td} /><td className={td} />
                  <td className={`${td} text-right`}>{rate}</td>
                  <td className={td}>%</td>
                  <td className={`${td} text-right font-bold`}>{fmt(amount)}</td>
                </tr>
              ))}
              {roundOff ? (
                <tr>
                  <td className={td} />
                  <td className={`${td} text-right font-bold italic`}>{t('roundOff').toUpperCase()}</td>
                  <td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} />
                  <td className={`${td} text-right font-bold`}>{fmt(roundOff)}</td>
                </tr>
              ) : null}
              {/* Blank space above the total, like the printed form. */}
              <tr className="h-16">
                <td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} />
                <td className={td} /><td className={td} /><td className={td} /><td className={td} />
              </tr>
              <tr className="border-y border-black">
                <td className={td} />
                <td className={`${td} text-right`}>{t('total')}</td>
                <td className={td} /><td className={td} />
                <td className={`${td} text-right font-bold`}>{totalQty}</td>
                <td className={td} /><td className={td} /><td className={td} />
                <td className={`${td} whitespace-nowrap text-right text-[13px] font-bold`}>₹ {fmt(grandTotal)}</td>
              </tr>
              {advance ? (
                <>
                  <tr>
                    <td className={td} />
                    <td className={`${td} text-right italic`}>
                      {t('lessAdvance')} ({[t(`mode_${invoice.advance_mode}`), printDate(invoice.advance_date_text)].filter(Boolean).join(', ')})
                    </td>
                    <td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} />
                    <td className={`${td} text-right`}>− {fmt(advance)}</td>
                  </tr>
                  <tr className="border-y border-black">
                    <td className={td} />
                    <td className={`${td} text-right font-bold`}>{t('balanceDue')}</td>
                    <td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} />
                    <td className={`${td} whitespace-nowrap text-right text-[13px] font-bold`}>₹ {fmt(balanceDue)}</td>
                  </tr>
                </>
              ) : null}
            </tbody>
          </table>

          <div className="break-inside-avoid px-1.5 pt-1">
            <div className="flex justify-between text-[10px]">
              <p>{t('amountChargeable')}</p>
              <p className="italic">{t('eoe')}</p>
            </div>
            <p className="text-[12px] font-bold">{inr(grandTotal)}</p>
          </div>

          {/* HSN-wise tax summary. */}
          <table className="mt-1 w-full break-inside-avoid border-collapse border-t border-black text-right tabular-nums">
            <thead>
              <tr className="text-center">
                <th rowSpan={2} className={`${th} text-left`}>{t('hsnSac')}</th>
                <th rowSpan={2} className={th}>{t('taxable')}</th>
                {totals.interState ? (
                  <th colSpan={2} className={th}>{t('igst')}</th>
                ) : (
                  <>
                    <th colSpan={2} className={th}>{t('cgst')}</th>
                    <th colSpan={2} className={th}>SGST/UTGST</th>
                  </>
                )}
                <th rowSpan={2} className={th}>{t('totalTaxAmount')}</th>
              </tr>
              <tr className="text-center">
                {(totals.interState ? [1] : [1, 2]).map((key) => (
                  <Fragment key={key}>
                    <th className={th}>{t('rate')}</th>
                    <th className={th}>{t('amount')}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {hsnRows.map((row) => (
                <tr key={`${row.hsn}-${row.rate}`}>
                  <td className={`${td} text-left`}>{row.hsn}</td>
                  <td className={td}>{fmt(row.taxable)}</td>
                  {totals.interState ? (
                    <><td className={td}>{row.rate}%</td><td className={td}>{fmt(row.igst)}</td></>
                  ) : (
                    <>
                      <td className={td}>{row.rate / 2}%</td><td className={td}>{fmt(row.cgst)}</td>
                      <td className={td}>{row.rate / 2}%</td><td className={td}>{fmt(row.sgst)}</td>
                    </>
                  )}
                  <td className={td}>{fmt(row.cgst + row.sgst + row.igst)}</td>
                </tr>
              ))}
              <tr className="border-t border-black font-bold">
                <td className={td}>{t('total')}</td>
                <td className={td}>{fmt(totals.taxableTotal)}</td>
                {totals.interState ? (
                  <><td className={td} /><td className={td}>{fmt(totals.igst)}</td></>
                ) : (
                  <>
                    <td className={td} /><td className={td}>{fmt(totals.cgst)}</td>
                    <td className={td} /><td className={td}>{fmt(totals.sgst)}</td>
                  </>
                )}
                <td className={td}>{fmt(taxTotal)}</td>
              </tr>
            </tbody>
          </table>

          <p className="break-inside-avoid border-t border-black px-1.5 py-1">
            {t('taxAmountWords')} : <b className="text-[12px]">{inr(taxTotal)}</b>
          </p>

          {/* Remarks and declaration on the left; bank, QR codes and signatory on the right. */}
          <div className="grid break-inside-avoid grid-cols-2">
            <div className="px-1.5 pb-1.5">
              {invoice.notes || invoice.dispatch_number ? (
                <>
                  <p className="italic">{t('remarks')}:</p>
                  {invoice.notes ? <p className="whitespace-pre-line">{invoice.notes}</p> : null}
                  {invoice.dispatch_number ? <p>{t('dispatchedAs')}: {invoice.dispatch_number}</p> : null}
                </>
              ) : null}
              <p className="mt-1 underline">{t('declaration')}</p>
              <p className="whitespace-pre-line">{company?.invoiceTerms || t('defaultDeclaration')}</p>
            </div>
            <div className="flex flex-col">
              <div className="px-1.5 pb-1">
                {business.bankAccount ? (
                  <>
                    <p>{t('bankDetails')}</p>
                    <table>
                      <tbody>
                        {[
                          [t('accountHolder'), business.legalName],
                          [t('bankName'), business.bankName],
                          [t('accountNo'), business.bankAccount],
                          [t('branchIfsc'), business.bankIfsc],
                        ].filter(([, value]) => value).map(([label, value]) => (
                          <tr key={label}><td className="pr-1">{label}</td><td className="pr-1">:</td><td className="font-bold">{value}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
                {/* SVGs generated locally by the qrcode library from our own data. */}
                {qr.upi || qr.dispatch ? (
                  <div className="mt-1 flex gap-3">
                    {[['upi', t('scanToPay')], ['dispatch', t('scanToDispatch')]].filter(([key]) => qr[key]).map(([key, caption]) => (
                      <div key={key} className="text-center">
                        <div className="h-20 w-20" dangerouslySetInnerHTML={{ __html: qr[key] }} />
                        <p className="max-w-[5rem] text-[9px]">{caption}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {/* An estimate carries no signature, only the fine print that it is
                  not a sale. A proforma is signed, with fine print that it is an offer. */}
              {isEstimate ? (
                <p className={`px-1.5 py-1 text-[9px] italic leading-tight ${isProforma ? '' : 'mt-auto border-l border-t border-black'}`}>
                  {t(isProforma ? 'proformaFinePrint' : 'estimateFinePrint', { name: business.legalName })}
                </p>
              ) : null}
              {isEstimate && !isProforma ? null : (
                <div className="mt-auto flex min-h-[5rem] flex-col justify-between border-l border-t border-black px-1.5 py-1 text-right">
                  <p className="font-bold">{t('forCompany', { name: business.legalName })}</p>
                  <p>{t('signatory')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="mt-1 text-center text-[10px]">{t('computerGenerated')}</p>
      </Paper>

      <InvoiceHistory invoiceId={invoice.id} t={t} />
    </div>
  );
}
