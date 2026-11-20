import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole, stockRoute } from '@/lib/stock-workflow';
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
    return NextResponse.json({ suggestions: await loadFormSuggestions() });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load suggestions', detail: error.message }, { status: 500 });
  }
});
