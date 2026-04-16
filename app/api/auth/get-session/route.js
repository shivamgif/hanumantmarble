import { NextResponse } from 'next/server';
import { getCurrentSession, getAuthModeLabel } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getCurrentSession(request);

    return NextResponse.json(
      {
        user: session?.user || null,
        mode: getAuthModeLabel(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        user: null,
        mode: getAuthModeLabel(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }
}
