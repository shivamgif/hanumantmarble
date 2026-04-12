/**
 * Stock Management API to record inventory movements
 * POST /api/stock/movements - Record stock in/out
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

// Graceful degradation for missing database
let sql = null;
let logAudit = async () => {};

try {
  const dbModule = await import('@/lib/db');
  sql = dbModule.sql;
  const auditModule = await import('@/lib/audit-logger');
  logAudit = auditModule.logAudit;
} catch (e) {
  console.warn('Database not configured yet:', e.message);
}

const VALID_MOVEMENT_TYPES = ['purchase', 'sale', 'adjustment', 'transfer', 'damage', 'return'];

export async function POST(request) {
  try {
    const session = await auth0.getSession(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!sql) {
      return NextResponse.json(
        { error: 'Database not configured. See STOCK_DEPLOYMENT_GUIDE.md Step 2' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { itemId, locationId, type, quantity, reference, notes } = body;

    if (!itemId || !type || !quantity) {
      return NextResponse.json(
        { error: 'itemId, type, and quantity are required' },
        { status: 400 }
      );
    }

    if (!VALID_MOVEMENT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid movement type. Must be one of: ${VALID_MOVEMENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Record movement
    const movement = await sql(
      `INSERT INTO stock_movements (itemId, locationId, type, quantity, reference, notes, createdBy)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [itemId, locationId || null, type, quantity, reference || null, notes || null, session.user.email]
    );

    // Update item quantity
    const quantityChange = ['purchase', 'return'].includes(type) ? quantity : -quantity;
    
    await sql(
      'UPDATE stock_items SET quantity = quantity + $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2',
      [quantityChange, itemId]
    );

    // Log audit
    await logAudit({
      action: 'CREATE',
      entityType: 'movement',
      entityId: movement[0].id,
      userId: session.user.sub,
      userEmail: session.user.email,
      changes: { new: movement[0] },
      details: `${type} of ${quantity} units for item ${itemId}`,
      request,
    });

    return NextResponse.json(movement[0], { status: 201 });
  } catch (error) {
    console.error('Error recording movement:', error);
    return NextResponse.json(
      { error: 'Failed to record movement' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const session = await auth0.getSession(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!sql) {
      return NextResponse.json(
        { movements: [], message: 'Database not configured yet.' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = 'SELECT * FROM stock_movements WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (itemId) {
      query += ` AND itemId = $${paramCount++}`;
      params.push(parseInt(itemId));
    }

    if (type) {
      query += ` AND type = $${paramCount++}`;
      params.push(type);
    }

    query += ` ORDER BY createdAt DESC LIMIT $${paramCount++}`;
    params.push(limit);

    const movements = await sql(query, params);

    return NextResponse.json({ movements });
  } catch (error) {
    console.error('Error fetching movements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch movements' },
      { status: 500 }
    );
  }
}
