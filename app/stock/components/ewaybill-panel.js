'use client';

import { useState } from 'react';
import { Download, Save, Truck } from 'lucide-react';
import { FORM_INPUT_CLASS, invalidateShipmentCache, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';
import { useInvoiceText } from './invoice-form';

/**
 * E-way bill for a dispatch registered from an invoice: download the portal's
 * bulk-upload JSON (truck taken from the dispatch), upload it on the e-way bill
 * portal, then type the 12-digit number back here. Approval refuses a dispatch
 * over the business's threshold until the number is in.
 */
export function EwayBillPanel({ shipment, userRole }) {
  const t = useInvoiceText();
  const [ewbNo, setEwbNo] = useState(shipment.ewb_no || '');
  const [saved, setSaved] = useState(shipment.ewb_no || '');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!['admin', 'manager', 'stock_maintainer'].includes(userRole)) return null;
  const url = `/api/stock/outbound-shipments/${shipment.id}/ewaybill`;

  async function download() {
    setMessage(null);
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage({ error: true, text: json.error || 'Could not build the e-way bill file' });
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(json.document, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: blobUrl, download: `ewaybill-${shipment.shipment_number}.json` }).click();
    URL.revokeObjectURL(blobUrl);
    if (!json.required) setMessage({ text: t('ewbNotRequired') });
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ewbNo }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ error: true, text: json.error || 'Could not save' });
    setSaved(json.shipment.ewb_no);
    // The preview caches shipments; drop this one so reopening shows the number.
    invalidateShipmentCache('dispatch', shipment.id);
    setMessage({ text: t('ewbSaved') });
  }

  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Truck className="h-4 w-4 text-brand-primary" /> {t('ewayBill')}
        {saved ? <span className="font-normal text-emerald-700 dark:text-emerald-400">{saved}</span> : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={download} className={PILL_BUTTON_CLASS}>
          <Download className="h-3.5 w-3.5" /> {t('downloadEwb')}
        </button>
        <input
          value={ewbNo}
          onChange={(e) => setEwbNo(e.target.value.replace(/\D/g, '').slice(0, 12))}
          inputMode="numeric"
          placeholder={t('ewbNumber')}
          aria-label={t('ewbNumber')}
          className={`${FORM_INPUT_CLASS} w-44`}
        />
        <button type="submit" disabled={busy || ewbNo.length !== 12 || ewbNo === saved} className={PILL_PRIMARY_BUTTON_CLASS}>
          <Save className="h-3.5 w-3.5" /> {t('save')}
        </button>
      </div>
      {message ? (
        <p className={`text-xs ${message.error ? 'text-rose-600' : 'text-slate-500'}`}>{message.text}</p>
      ) : null}
    </form>
  );
}
