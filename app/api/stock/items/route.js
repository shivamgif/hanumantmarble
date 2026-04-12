import { sql } from '@/lib/db';

/**
 * Stock Items API
 * GET /api/stock/items - List all items
 * POST /api/stock/items - Create new item
 * PUT /api/stock/items/[id] - Update item
 * DELETE /api/stock/items/[id] - Delete item
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { logAudit } from '@/lib/audit-logger';

export async function GET(request) {
  try {
    const session = await auth0.getSession(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

    let query = 'SELECT * FROM stock_items WHERE isActive = true';
    const params = [];

    if (categoryId) {
      query += ' AND categoryId = $1';
      params.push(parseInt(categoryId));
    }

    query += ' ORDER BY name ASC';

    const items = await sql(query, params);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth0.getSession(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { sku, name, nameHi, categoryId, description, descriptionHi, reorderLevel, maximumLevel, unit, costPrice, sellingPrice } = body;

    if (!sku || !name) {
      return NextResponse.json(
        { error: 'SKU and name are required' },
        { status: 400 }
      );
    }

    const result = await sql(
      `INSERT INTO stock_items (sku, name, nameHi, categoryId, description, descriptionHi, reorderLevel, maximumLevel, unit, costPrice, sellingPrice)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [sku, name, nameHi, categoryId || null, description, descriptionHi, reorderLevel, maximumLevel, unit, costPrice, sellingPrice]
    );

    await logAudit({
      action: 'CREATE',
      entityType: 'item',
      entityId: result[0].id,
      userId: session.user.sub,
      userEmail: session.user.email,
      changes: { new: result[0] },
      request,
    });

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error('Error creating item:', error);
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const session = await auth0.getSession(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('id');
    const body = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    // Get current item for audit log
    const currentItem = await sql('SELECT * FROM stock_items WHERE id = $1', [parseInt(itemId)]);
    if (currentItem.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { SKU, name, nameHi, categoryId, description, descriptionHi, reorderLevel, maximumLevel, unit, costPrice, sellingPrice, isActive } = body;

    const result = await sql(
      `UPDATE stock_items SET 
        sku = COALESCE($1, sku),
        name = COALESCE($2, name),
        nameHi = COALESCE($3, nameHi),
        categoryId = COALESCE($4, categoryId),
        description = COALESCE($5, description),
        descriptionHi = COALESCE($6, descriptionHi),
        reorderLevel = COALESCE($7, reorderLevel),
        maximumLevel = COALESCE($8, maximumLevel),
        unit = COALESCE($9, unit),
        costPrice = COALESCE($10, costPrice),
        sellingPrice = COALESCE($11, sellingPrice),
        isActive = COALESCE($12, isActive),
        updatedAt = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [sku, name, nameHi, categoryId, description, descriptionHi, reorderLevel, maximumLevel, unit, costPrice, sellingPrice, isActive, parseInt(itemId)]
    );

    await logAudit({
      action: 'UPDATE',
      entityType: 'item',
      entityId: parseInt(itemId),
      userId: session.user.sub,
      userEmail: session.user.email,
      changes: { old: currentItem[0], new: result[0] },
      request,
    });

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const session = await auth0.getSession(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('id');

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    // Soft delete: mark as inactive
    const result = await sql(
      'UPDATE stock_items SET isActive = false, updatedAt = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [parseInt(itemId)]
    );

    await logAudit({
      action: 'DELETE',
      entityType: 'item',
      entityId: parseInt(itemId),
      userId: session.user.sub,
      userEmail: session.user.email,
      changes: { deleted: result[0] },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    );
  }
}
