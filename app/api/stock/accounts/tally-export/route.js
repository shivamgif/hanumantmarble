import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { accountsError, accountsGuard, loadBusiness } from '@/lib/accounts-db';
import { stockRoute } from '@/lib/stock-workflow';
import { buildTallyXml } from '@/lib/tally-xml.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// A function response tops out near 6 MB; a voucher is about 1 KB of XML.
const MAX_VOUCHERS = 3000;

const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * GET ?businessId&from&to[&onlyNew=1] → Tally import XML of the business's
 * vouchers in the range, as a download, and stamps them exported.
 *
 * Posted vouchers go out as they are. A cancelled voucher goes out (marked
 * cancelled) only if Tally already has it, i.e. it was exported before; one
 * cancelled before it ever left the app is skipped. onlyNew: posted ones never
 * exported, plus exported ones cancelled since.
 */
export const GET = stockRoute(async function GET(request) {
  const gate = await accountsGuard(request);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(request.url);
    const business = await loadBusiness(searchParams.get('businessId'));
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) throw bad('Pick a from and to date.');
    const which = searchParams.get('onlyNew') === '1'
      ? `(v.status = 'posted' AND v.exported_at IS NULL)
         OR (v.status = 'cancelled' AND v.exported_at IS NOT NULL AND v.cancelled_at > v.exported_at)`
      : `v.status = 'posted' OR (v.status = 'cancelled' AND v.exported_at IS NOT NULL)`;

    const vouchers = await sql(
      `SELECT v.id, v.tenant_id, v.voucher_type, v.voucher_date::text AS voucher_date, v.voucher_number, v.reference,
              v.narration, v.status, pl.name AS party_ledger_name
       FROM acc_vouchers v
       LEFT JOIN acc_ledgers pl ON pl.id = v.party_ledger_id
       WHERE v.business_id = $1 AND v.voucher_date BETWEEN $2 AND $3 AND v.voucher_type <> 'opening' AND (${which})
       ORDER BY v.voucher_date, v.id
       LIMIT ${MAX_VOUCHERS + 1}`,
      [business.id, from, to]
    );
    if (vouchers.length > MAX_VOUCHERS) throw bad(`More than ${MAX_VOUCHERS} vouchers in that range. Export a shorter range.`);

    const ids = vouchers.map((v) => v.id);
    const lines = ids.length ? await sql(
      `SELECT vl.voucher_id, vl.ledger_id, vl.amount, vl.bill_ref_type, vl.bill_ref, l.name AS ledger_name
       FROM acc_voucher_lines vl JOIN acc_ledgers l ON l.id = vl.ledger_id
       WHERE vl.voucher_id = ANY($1::bigint[])
       ORDER BY vl.voucher_id, vl.sort`,
      [ids]
    ) : [];
    const ledgers = lines.length ? await sql(
      `SELECT name, group_name, gstin, state_code FROM acc_ledgers WHERE id = ANY($1::bigint[]) ORDER BY group_name, name`,
      [[...new Set(lines.map((line) => line.ledger_id))]]
    ) : [];

    const byVoucher = new Map(vouchers.map((v) => [String(v.id), { ...v, lines: [] }]));
    for (const line of lines) byVoucher.get(String(line.voucher_id)).lines.push(line);
    const xml = buildTallyXml({ tenantId: vouchers[0]?.tenant_id ?? 0, ledgers, vouchers: [...byVoucher.values()] });

    // Commits with the 200 below (stockRoute's request transaction).
    if (ids.length) await sql('UPDATE acc_vouchers SET exported_at = NOW() WHERE id = ANY($1::bigint[])', [ids]);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="tally-${business.id}-${from}-to-${to}.xml"`,
        'Cache-Control': 'no-store',
        'X-Voucher-Count': String(ids.length),
      },
    });
  } catch (error) {
    return accountsError(error, 'Failed to build the Tally export');
  }
});
