import { NextResponse } from 'next/server';
import { sql, withTransaction } from '@/lib/db';
import { canSell, getRoleFlags, normalizeStockRole, recordTimelineEvent, stockRoute } from '@/lib/stock-workflow';
import { accountsError, withBooks } from '@/lib/accounts-db';
import { lineQty, lineUnit } from '@/lib/gst-invoice.mjs';
import { creditedSoFar } from '@/lib/notes.mjs';
import { listNotes, liveCreditNotes, prepareForInvoice } from '@/lib/notes-db';
import { canViewInvoice, loadSalesInvoice, salesInvoiceGuard } from '@/lib/sales-invoices';

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/**
 * GET                         → credit notes, newest first (?status=)
 * GET ?invoiceId=[&shipmentId] → what the "Raise credit note" form needs: the
 *   invoice's lines with what is left to credit, prefilled with the quantities
 *   a dispatch return brought back.
 */
export const GET = stockRoute(async function GET(request) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  const { appUser } = gate;
  const { searchParams } = new URL(request.url);
  const invoiceId = Number(searchParams.get('invoiceId')) || 0;

  try {
    if (!invoiceId) {
      const notes = await listNotes({
        status: searchParams.get('status') || null,
        ownerUserId: normalizeStockRole(appUser.role) === 'salesperson' ? Number(appUser.id) : null,
      });
      return NextResponse.json({ notes });
    }

    const invoice = await loadSalesInvoice(invoiceId);
    if (!invoice || !canViewInvoice(appUser, invoice)) throw fail('Invoice not found', 404);
    const used = creditedSoFar(invoice.items, await liveCreditNotes(sql, invoice.id));

    // Returned quantities, matched to invoice lines by item in order (the
    // dispatch ships exactly the invoice's lines).
    const returnedByItem = new Map();
    const shipmentId = Number(searchParams.get('shipmentId')) || 0;
    let shipmentNumber = null;
    if (shipmentId) {
      const rows = await sql(
        `SELECT soi.item_id, soi.returned_whole_qty, soi.returned_qty_sqft, s.shipment_number
         FROM stock_outbound_shipment_items soi
         JOIN stock_outbound_shipments s ON s.id = soi.outbound_shipment_id
         WHERE s.id = $1 AND s.sales_invoice_id = $2 AND s.approval_status = 'approved'
         ORDER BY soi.id`,
        [shipmentId, invoice.id]
      );
      if (!rows.length) throw fail('That dispatch is not an approved dispatch of this invoice.', 400);
      shipmentNumber = rows[0].shipment_number;
      for (const row of rows) {
        const key = String(row.item_id);
        if (!returnedByItem.has(key)) returnedByItem.set(key, []);
        returnedByItem.get(key).push(row);
      }
    }

    const lines = invoice.items.map((item, index) => {
      const billedQty = lineQty(item);
      const returned = returnedByItem.get(String(item.itemId))?.shift();
      const leftQty = Math.max(0, Math.round((billedQty - used[index].qty) * 1000) / 1000);
      const returnedQty = returned
        ? Number(item.itemCategory === 'stone' ? returned.returned_qty_sqft : returned.returned_whole_qty) || 0
        : 0;
      return {
        lineIndex: index,
        itemLabel: item.itemLabel,
        itemCategory: item.itemCategory,
        unit: lineUnit(item),
        billedQty,
        rate: Number(item.ratePerUnit),
        gstRate: Number(item.gstRate),
        leftQty,
        leftValue: Math.max(0, Math.round((billedQty * Number(item.ratePerUnit) - used[index].taxable) * 100) / 100),
        prefillQty: Math.min(returnedQty, leftQty),
      };
    });
    return NextResponse.json({
      invoice: {
        id: Number(invoice.id),
        invoice_number: invoice.invoice_number,
        invoice_date_text: invoice.invoice_date_text,
        bill_to_name: invoice.bill_to_name,
        bill_to_state_code: invoice.bill_to_state_code,
        seller_state_code: invoice.seller_snapshot?.business?.stateCode || null,
        grand_total: Number(invoice.grand_total),
        status: invoice.status,
      },
      lines,
      shipmentNumber,
    });
  } catch (error) {
    return accountsError(error, 'Failed to load credit notes');
  }
});

/** Raise a credit note against an issued invoice. It waits for another approver. */
export const POST = stockRoute(async function POST(request) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  const { appUser } = gate;
  if (!canSell(appUser) && !getRoleFlags(appUser.role).canApprove) {
    return NextResponse.json({ error: 'Only sellers and approvers can raise credit notes' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const note = await withBooks(appUser, async (tx) => {
      const [invoice] = await tx(
        'SELECT *, invoice_date::text AS invoice_date_text FROM stock_sales_invoices WHERE id = $1 FOR UPDATE',
        [Number(body.salesInvoiceId) || 0]
      );
      if (!invoice || !canViewInvoice(appUser, invoice)) throw fail('Invoice not found', 404);
      if (invoice.status !== 'approved') throw fail(`Only an issued invoice can get a credit note (this one is ${invoice.status}).`, 409);

      const shipmentId = Number(body.outboundShipmentId) || null;
      if (shipmentId) {
        const [shipment] = await tx('SELECT 1 FROM stock_outbound_shipments WHERE id = $1 AND sales_invoice_id = $2', [shipmentId, invoice.id]);
        if (!shipment) throw fail('That dispatch is not of this invoice.', 400);
      }

      const { items, totals } = await prepareForInvoice(tx, invoice, { reason: body.reason, lines: body.lines });
      const [row] = await tx(
        `INSERT INTO acc_notes (business_id, kind, party_kind, customer_id, sales_invoice_id, outbound_shipment_id,
           original_number, original_date, reason, items, taxable_total, cgst, sgst, igst, grand_total, notes, created_by_user_id)
         VALUES ($1, 'credit', 'customer', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          invoice.business_id, invoice.customer_id, invoice.id, shipmentId,
          invoice.invoice_number, invoice.invoice_date_text, body.reason, JSON.stringify(items),
          totals.taxableTotal, totals.cgst, totals.sgst, totals.igst, totals.grandTotal,
          String(body.notes || '').trim().slice(0, 1000) || null, appUser.id,
        ]
      );
      return { ...row, bill_to_name: invoice.bill_to_name };
    });

    try {
      await withTransaction(() => recordTimelineEvent({
        eventType: 'other',
        entityType: 'sales_invoice',
        entityId: note.sales_invoice_id,
        summary: `Credit note of ₹${note.grand_total} raised against ${note.original_number} for approval`,
        details: { noteId: note.id, reason: note.reason },
        userId: appUser.id,
      }));
    } catch (sideEffectError) {
      console.error('Failed to log credit note:', sideEffectError);
    }

    return NextResponse.json({ note, message: `Credit note for ${note.bill_to_name} sent for approval.` }, { status: 201 });
  } catch (error) {
    return accountsError(error, 'Failed to save credit note');
  }
});
