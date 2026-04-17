import { auth } from '@/lib/auth';
import { ensureAuthSchema } from '@/lib/auth-db';
import { toNextJsHandler } from 'better-auth/next-js';

export const dynamic = 'force-dynamic';

const handler = toNextJsHandler(auth);

export async function GET(request) {
  await ensureAuthSchema(auth);
  return handler.GET(request);
}

export async function POST(request) {
  await ensureAuthSchema(auth);
  return handler.POST(request);
}
