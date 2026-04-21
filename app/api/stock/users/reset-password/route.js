import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getStockContext, hasAnyStockRole } from '@/lib/stock-workflow';
import { getAuthDatabase } from '@/lib/auth-db';
import { validateStockPassword } from '@/lib/password-policy';
import { sql } from '@/lib/db';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Must match Better Auth's password hashing config
async function hashPasswordForBetterAuth(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString('hex')}`;
}

export async function POST(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden: only admins can reset passwords' }, { status: 403 });
  }

  const body = await request.json();
  const targetEmail = String(body.email || '').trim().toLowerCase();
  const newPassword = String(body.newPassword || '');

  if (!targetEmail) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const passwordError = validateStockPassword(newPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const authDb = getAuthDatabase();
  if (!authDb) {
    return NextResponse.json({ error: 'Auth database not configured' }, { status: 503 });
  }

  const { db } = authDb;

  try {
    const hashed = await hashPasswordForBetterAuth(newPassword);

    // Find user in Better Auth's user table
    const baUser = await db
      .selectFrom('user')
      .select(['id', 'email', 'name'])
      .where('email', '=', targetEmail)
      .executeTakeFirst();

    if (!baUser) {
      // No Better Auth record — look up name from stock_app_users and create one
      const [stockUser] = await sql(
        `SELECT name FROM stock_app_users WHERE LOWER(email) = $1 LIMIT 1`,
        [targetEmail]
      );

      if (!stockUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const newUserId = crypto.randomUUID();

      await db.insertInto('user').values({
        id: newUserId,
        email: targetEmail,
        name: stockUser.name || targetEmail,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).execute();

      await db.insertInto('account').values({
        id: crypto.randomUUID(),
        userId: newUserId,
        accountId: newUserId,
        providerId: 'credential',
        password: hashed,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).execute();

      return NextResponse.json({ success: true, provisioned: true });
    }

    // User exists — upsert credential account
    const existing = await db
      .selectFrom('account')
      .select('id')
      .where('userId', '=', baUser.id)
      .where('providerId', '=', 'credential')
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('account')
        .set({ password: hashed, updatedAt: new Date() })
        .where('id', '=', existing.id)
        .execute();
    } else {
      await db.insertInto('account').values({
        id: crypto.randomUUID(),
        userId: baUser.id,
        accountId: baUser.id,
        providerId: 'credential',
        password: hashed,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).execute();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[reset-password] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to reset password' },
      { status: 500 }
    );
  }
}
