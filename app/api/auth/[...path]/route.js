import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const dynamic = 'force-dynamic';

// Auth tables come from db/migrations (0000_baseline.sql). After a better-auth
// upgrade, `npx @better-auth/cli generate` prints the SQL for a new migration file.
export const { GET, POST } = toNextJsHandler(auth);
