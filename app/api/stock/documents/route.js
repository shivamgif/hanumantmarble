import { NextResponse } from 'next/server';
import {
  ensureDatabaseAvailable,
  generateReference,
  getStockContext,
  hasAnyStockRole,
  insertStockDocument,
  linkDocumentToEntity,
  normalizeText,
  normalizeStockRole,
  readUploadFile,
  recordTimelineEvent,
} from '@/lib/stock-workflow';
import { sql } from '@/lib/db';

const allowedDocumentTypes = new Set([
  'purchase_invoice',
  'transporter_bill',
  'gatepass',
  'sales_invoice',
  'delivery_receipt',
  'customer_acknowledgement',
  'photo_evidence',
  'other',
]);

const allowedEntityTypes = new Set([
  'purchase_order',
  'inbound_shipment',
  'sales_order',
  'outbound_shipment',
  'acknowledgement',
  'movement',
  'customer',
  'supplier',
  'other',
]);

const imageOnlyDocumentTypes = new Set(['transporter_bill', 'gatepass', 'delivery_receipt', 'customer_acknowledgement']);

export async function GET(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ documents: [], message: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer', 'salesperson'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');
    const documentType = searchParams.get('documentType');
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    const filters = [];
    const values = [];

    if (entityType) {
      values.push(entityType);
      filters.push(`entity_type = $${values.length}`);
    }

    if (entityId) {
      values.push(Number(entityId));
      filters.push(`entity_id = $${values.length}`);
    }

    if (documentType) {
      values.push(documentType);
      filters.push(`document_type = $${values.length}`);
    }

    values.push(limit);

    const documents = await sql(
      `SELECT *
       FROM stock_documents
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values
    );

    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load documents', detail: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, appUser } = await getStockContext(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await ensureDatabaseAvailable())) {
    return NextResponse.json({ error: 'Database not configured yet.' }, { status: 503 });
  }

  if (!hasAnyStockRole(appUser, ['admin', 'manager', 'stock_maintainer', 'salesperson'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const uploadedFile = formData.get('file');
    const documentType = normalizeText(formData.get('documentType'));
    const entityType = normalizeText(formData.get('entityType'));
    const entityId = formData.get('entityId');
    const documentNumber = normalizeText(formData.get('documentNumber')) || generateReference('DOC');
    const notes = normalizeText(formData.get('notes')) || null;
    const normalizedRole = normalizeStockRole(appUser?.role);

    if (!uploadedFile || typeof uploadedFile === 'string') {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 });
    }

    if (!allowedDocumentTypes.has(documentType)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    if (!allowedEntityTypes.has(entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    if (normalizedRole === 'salesperson' && entityType !== 'outbound_shipment') {
      return NextResponse.json({ error: 'Salesperson can upload documents only for outbound shipments' }, { status: 403 });
    }

    const numericEntityId = entityId ? Number(entityId) : null;

    if (!numericEntityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }

    const file = await readUploadFile(uploadedFile);

    if (imageOnlyDocumentTypes.has(documentType) && !file.mimeType.startsWith('image/')) {
      return NextResponse.json({ error: 'Transporter bills and gatepasses must be uploaded as images' }, { status: 400 });
    }

    const document = await insertStockDocument({
      documentType,
      entityType,
      entityId: numericEntityId,
      fileName: file.fileName,
      fileUrl: file.dataUrl,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
      checksum: file.checksum,
      notes,
      createdBy: session.user.email,
      documentNumber,
    });

    await linkDocumentToEntity({
      document,
      documentType,
      entityType,
      entityId: numericEntityId,
      documentNumber,
    });

    await recordTimelineEvent({
      eventType: 'other',
      entityType: 'stock_document',
      entityId: document.id,
      summary: `Uploaded ${document.document_type.replace(/_/g, ' ')}: ${document.document_number || document.file_name}`,
      details: {
        entityType,
        entityId: numericEntityId,
        fileName: document.file_name,
      },
      userId: appUser?.id || null,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('Failed to upload document:', error);
    return NextResponse.json({ error: 'Failed to upload document', detail: error.message }, { status: 500 });
  }
}