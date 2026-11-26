import { NextResponse } from 'next/server';
import { customerNamesForPhone, ensureDatabaseAvailable, getStockContext, hasAnyStockRole, stockRoute } from '@/lib/stock-workflow';
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
    // ?phone=…: just the names already saved for that number, which the
    // dispatch and estimate forms suggest once a phone is typed.
    const phone = new URL(request.url).searchParams.get('phone');
    if (phone != null) {
      return NextResponse.json({ customerNames: await customerNamesForPhone(phone) });
    }
    return NextResponse.json({ suggestions: await loadFormSuggestions() });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load suggestions', detail: error.message }, { status: 500 });
  }
});
