/**
 * Audit logs API endpoint
 * GET /api/stock/audit - Retrieve audit logs with filtering
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getAuditLogs } from '@/lib/audit-logger';

export async function GET(request) {
  try {
    const session = await auth0.getSession(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const userEmail = searchParams.get('userEmail');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const logs = await getAuditLogs({
      action,
      entityType,
      userEmail,
      limit: Math.min(limit, 500), // Cap at 500
      offset,
    });

    return NextResponse.json({ logs, count: logs.length });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
