import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { recordTimelineEvent, stockRoute } from '@/lib/stock-workflow';
import { canViewInvoice, loadSalesInvoice, salesInvoiceGuard } from '@/lib/sales-invoices';

/**
 * An invoice's history: every action logged against it (raised, corrected,
 * proforma, approved, rejected, cancelled) plus comments. A comment is a
 * timeline event like the rest ('other', details.action = 'comment'), so the
 * event_type CHECK needs no migration. Whoever can open the invoice can read
 * and comment.
 */
async function gate(request, context) {
  const guard = await salesInvoiceGuard(request);
  if (guard.error) return guard;
  const invoiceId = Number((await context.params).id);
  const invoice = await loadSalesInvoice(invoiceId);
  if (!invoice || !canViewInvoice(guard.appUser, invoice)) {
    return { error: NextResponse.json({ error: 'Invoice not found' }, { status: 404 }) };
  }
  return { ...guard, invoiceId };
}

export const GET = stockRoute(async function GET(request, context) {
  const access = await gate(request, context);
  if (access.error) return access.error;
  try {
    // ponytail: newest 200; an invoice with more history than that is not a real case yet.
    const events = await sql(
      // occurred_at is UTC wall time (timestamp without zone, session in GMT): shown in IST.
      `SELECT e.id, e.summary, e.details, u.name AS user_name,
              TO_CHAR((e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') AS occurred_text
       FROM stock_timeline_events e
       LEFT JOIN stock_app_users u ON u.id = e.recorded_by_user_id
       WHERE e.entity_type = 'sales_invoice' AND e.entity_id = $1
       ORDER BY e.occurred_at DESC, e.id DESC
       LIMIT 200`,
      [access.invoiceId]
    );
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Failed to load invoice history:', error);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
});

export const POST = stockRoute(async function POST(request, context) {
  const access = await gate(request, context);
  if (access.error) return access.error;
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'Write a comment first.' }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: 'Keep a comment under 1000 characters.' }, { status: 400 });
  try {
    await recordTimelineEvent({
      eventType: 'other',
      entityType: 'sales_invoice',
      entityId: access.invoiceId,
      summary: text,
      details: { action: 'comment' },
      userId: access.appUser.id,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Failed to add invoice comment:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
});
