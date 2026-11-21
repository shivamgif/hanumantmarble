import { NextResponse } from 'next/server';
import { getRoleFlags, recordTimelineEvent, stockRoute } from '@/lib/stock-workflow';
import { sql, withTransaction } from '@/lib/db';
import { buildEinvoiceJson, parseIrpResponse } from '@/lib/einvoice.mjs';
import { noteEinvoiceDoc } from '@/lib/notes.mjs';
import { listNotes } from '@/lib/notes-db';
import { listSalesInvoices, loadSalesInvoice, salesInvoiceGuard, sellerFor } from '@/lib/sales-invoices';

/**
 * E-invoice round trip without a paid GSP:
 *   GET  → IRP v1.1 JSON for approved B2B invoices and credit notes still
 *          waiting for an IRN, to upload on the portal's bulk upload.
 *   POST → the portal's response file; each IRN is matched to its invoice or
 *          note by the document number inside the signed QR.
 * Approvers only: an IRN makes the invoice final.
 */

async function approverGate(request) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate;
  if (!getRoleFlags(gate.appUser.role).canApprove) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return gate;
}

export const GET = stockRoute(async function GET(request) {
  const gate = await approverGate(request);
  if (gate.error) return gate.error;

  try {
    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get('ids') || '').split(',').map(Number).filter((n) => n > 0);
    const invoices = ids.length
      ? (await Promise.all(ids.map((id) => loadSalesInvoice(id)))).filter(Boolean)
      : await listSalesInvoices({ status: 'needs_irn' });

    const documents = [];
    const problems = [];
    for (const invoice of invoices) {
      if (invoice.status !== 'approved' || invoice.einvoice_status !== 'pending') {
        problems.push(`${invoice.invoice_number || `Estimate #${invoice.id}`}: does not need an IRN.`);
        continue;
      }
      try {
        documents.push(buildEinvoiceJson(invoice, (await sellerFor(invoice)).business));
      } catch (error) {
        problems.push(error.message);
      }
    }
    // Credit notes ride along with the full download (not with ?ids=, which picks invoices).
    for (const note of ids.length ? [] : await listNotes({ status: 'needs_irn' })) {
      try {
        const invoice = await loadSalesInvoice(note.sales_invoice_id);
        documents.push(buildEinvoiceJson(noteEinvoiceDoc(note, invoice), (await sellerFor(invoice)).business));
      } catch (error) {
        problems.push(error.message);
      }
    }
    return NextResponse.json({ documents, problems });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to build e-invoice JSON', detail: error.message }, { status: 500 });
  }
});

export const POST = stockRoute(async function POST(request) {
  const gate = await approverGate(request);
  if (gate.error) return gate.error;

  try {
    const { text } = await request.json().catch(() => ({}));
    let parsed;
    try {
      parsed = JSON.parse(String(text || ''));
    } catch {
      return NextResponse.json({ error: 'That file is not JSON. Upload the response file downloaded from the e-invoice portal.' }, { status: 400 });
    }

    const rows = parseIrpResponse(parsed);
    if (!rows.length) {
      return NextResponse.json({ error: 'No generated IRNs found in that file.' }, { status: 400 });
    }

    const updated = [];
    const skipped = [];
    for (const row of rows.slice(0, 500)) {
      // `doc_table` comes from these literals only, never from the file.
      const invoice = (await sql(
        `SELECT 'stock_sales_invoices' AS doc_table, si.id, si.id AS invoice_id, si.status, si.einvoice_status, si.seller_snapshot
         FROM stock_sales_invoices si WHERE si.invoice_number = $1
         UNION ALL
         SELECT 'acc_notes', n.id, n.sales_invoice_id, n.status, n.einvoice_status, si.seller_snapshot
         FROM acc_notes n JOIN stock_sales_invoices si ON si.id = n.sales_invoice_id WHERE n.note_number = $1`,
        [row.docNo]
      ))[0];
      if (!invoice) { skipped.push({ docNo: row.docNo, reason: 'No invoice or credit note with this number.' }); continue; }
      if (invoice.status !== 'approved') { skipped.push({ docNo: row.docNo, reason: `Document is ${invoice.status}.` }); continue; }
      // A response for another GSTIN's invoice with the same number must not attach here.
      const sellerGstin = invoice.seller_snapshot?.business?.gstin;
      if (row.sellerGstin && sellerGstin && row.sellerGstin !== sellerGstin) {
        skipped.push({ docNo: row.docNo, reason: `IRN belongs to GSTIN ${row.sellerGstin}.` });
        continue;
      }
      try {
        // A savepoint per row: one duplicate IRN must not abort the request's
        // transaction and with it every row after it.
        const recorded = await withTransaction(async (tx) => {
          const result = await tx(
            `UPDATE ${invoice.doc_table}
                SET irn = $1, ack_no = $2, ack_date = $3, signed_qr = $4, einvoice_status = 'generated', updated_at = NOW()
              WHERE id = $5 AND einvoice_status IN ('pending', 'generated')
              RETURNING id`,
            [row.irn, row.ackNo, row.ackDate, row.signedQr, invoice.id]
          );
          if (!result[0]) return false;
          await recordTimelineEvent({
            eventType: 'other',
            entityType: 'sales_invoice',
            entityId: invoice.invoice_id,
            summary: `IRN recorded for ${row.docNo}`,
            details: { irn: row.irn, ackNo: row.ackNo },
            userId: gate.appUser.id,
          });
          return true;
        });
        if (!recorded) { skipped.push({ docNo: row.docNo, reason: 'Invoice does not need an IRN.' }); continue; }
        updated.push(row.docNo);
      } catch (error) {
        skipped.push({ docNo: row.docNo, reason: error?.code === '23505' ? 'This IRN is already on another document.' : error.message });
      }
    }
    return NextResponse.json({ updated, skipped });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to import IRP response', detail: error.message }, { status: 500 });
  }
});
