import { NextResponse } from 'next/server';
import { customerSuggestions, ensureDatabaseAvailable, getStockContext, hasAnyStockRole, stockRoute } from '@/lib/stock-workflow';
import { loadFormSuggestions } from '@/lib/stock-suggestions';

export const GET = stockRoute(async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ suggestions: {}, message: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer', 'salesperson'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // ?phone=… or ?customerName=…: saved customers for the dispatch and
    // estimate forms to suggest (see CustomerPhoneNameFields).
    const params = new URL(request.url).searchParams;
    if (params.has('phone') || params.has('customerName')) {
      const customers = await customerSuggestions(params.has('phone') ? { phone: params.get('phone') } : { name: params.get('customerName') });
      return NextResponse.json({ customers });
    }
    return NextResponse.json({ suggestions: await loadFormSuggestions() });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load suggestions', detail: error.message }, { status: 500 });
  }
});
