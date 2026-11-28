import { NextResponse } from 'next/server';
import {
  canSell,
  approverUserIds,
  getRoleFlags,
  normalizeStockRole,
  notifyUsers,
  recordTimelineEvent, stockRoute } from '@/lib/stock-workflow';
import { sql, withTransaction } from '@/lib/db';
import { estimateSql, listSalesInvoices, readEstimate, salesInvoiceGuard } from '@/lib/sales-invoices';

export const GET = stockRoute(async function GET(request) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  const { appUser } = gate;
  // Stock maintainers open single issued invoices (scan to dispatch), never the list.
  if (normalizeStockRole(appUser.role) === 'stock_maintainer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim().slice(0, 100) || '';
    // ?page=: the invoices list, a page at a time. Without it: the topbar's
    // quick search (top 5) or the newest 100.
    const paged = searchParams.has('page');
    const pageSize = Math.min(Math.max(Number(searchParams.get('pageSize')) || 25, 1), 100);
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);
    const rows = await listSalesInvoices({
      status: searchParams.get('status') || null,
      ownerUserId: normalizeStockRole(appUser.role) === 'salesperson' ? Number(appUser.id) : null,
      search,
      ...(paged ? { limit: pageSize, offset: (page - 1) * pageSize } : search ? { limit: 5 } : {}),
    });
    const total = Number(rows[0]?.total_count ?? 0);
    const invoices = rows.map(({ total_count: _count, ...invoice }) => invoice);
    return NextResponse.json({ invoices, total, page, pageSize });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load invoices', detail: error.message }, { status: 500 });
  }
});

export const POST = stockRoute(async function POST(request) {
  const gate = await salesInvoiceGuard(request);
  if (gate.error) return gate.error;
  const { session, appUser } = gate;

  if (!canSell(appUser) && !getRoleFlags(appUser.role).canApprove) {
    return NextResponse.json({ error: 'Only sellers can raise estimates' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { row, seller, totals } = await readEstimate(body, appUser);
    const { keys, values } = estimateSql({ ...row, created_by_user_id: appUser.id });
    const rows = await sql(
      `INSERT INTO stock_sales_invoices (${keys.join(', ')})
       VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    const invoice = rows[0];
    const { bill_to_name: billToName } = row;

    try {
      await withTransaction(async () => {
        await notifyUsers({
          userIds: await approverUserIds(),
          actorId: appUser.id,
          eventType: 'other',
          messageText: `New estimate from ${seller.name} for ${billToName}: ₹${totals.grandTotal}. Review and approve to issue the invoice.`,
          sourceTable: 'stock_sales_invoices',
          sourceId: invoice.id,
          createdBy: session.user.email,
        });
        await recordTimelineEvent({
          eventType: 'other',
          entityType: 'sales_invoice',
          entityId: invoice.id,
          summary: `Estimate for ${billToName} submitted for approval`,
          details: { grandTotal: totals.grandTotal, salespersonUserId: seller.id },
          userId: appUser.id,
        });
      });
    } catch (sideEffectError) {
      console.error('Failed to notify about new estimate:', sideEffectError);
    }

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (status === 500) console.error('Failed to create estimate:', error);
    return NextResponse.json(
      { error: status === 500 ? 'Failed to save estimate' : error.message, detail: error.message },
      { status }
    );
  }
});
