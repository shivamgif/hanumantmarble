import { NextResponse } from 'next/server';
import { ensureDatabaseAvailable, getRoleFlags, getStockContext, recordTimelineEvent } from '@/lib/stock-workflow';
import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { GST_STATES, INVOICE_PREFIX_PATTERN, isValidGstin, serializeBusiness } from '@/lib/gst-invoice.mjs';

/**
 * Businesses — the legal entities (one GSTIN each) that branches trade under.
 * stock_locations.business_id points here; a sales invoice takes its GSTIN,
 * seller state and number series from the business of the branch it is raised at.
 *
 * Same rules as /api/stock/locations: anyone signed in may read, managers and
 * admins write, and there is no DELETE — issued invoices reference the row, so
 * retiring one sets is_active = FALSE.
 */

const COLUMNS = `id, legal_name, trade_name, gstin, state_code, address, phone, email,
  bank_name, bank_account, bank_ifsc, invoice_prefix, is_active,
  city, pincode, upi_id, einvoice_enabled, ewb_threshold`;

async function guard(request, { requireManage = true } = {}) {
  const { session, appUser } = await getStockContext(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await ensureDatabaseAvailable())) {
    return { error: NextResponse.json({ error: 'Database not configured' }, { status: 503 }) };
  }
  if (!(await getStockSchemaCapabilities()).hasSalesInvoices) {
    return { error: NextResponse.json({ error: 'Invoicing is not set up yet. Run the sales invoices migration.' }, { status: 503 }) };
  }
  if (!appUser) {
    return { error: NextResponse.json({ error: 'No employee record for this account' }, { status: 403 }) };
  }
  if (requireManage && !getRoleFlags(appUser.role).canManageAttendance) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { appUser };
}

const text = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

/** Validates the fields present on body. Returns { fields, error }. */
function readFields(body, { partial }) {
  const fields = {};
  const has = (key) => body[key] !== undefined;

  if (!partial || has('legalName')) {
    fields.legal_name = text(body.legalName);
    if (!fields.legal_name) return { error: 'Legal name is required' };
  }
  if (!partial || has('stateCode')) {
    fields.state_code = text(body.stateCode);
    if (!GST_STATES[fields.state_code]) return { error: 'Select a valid state' };
  }
  if (!partial || has('gstin')) {
    fields.gstin = text(body.gstin)?.toUpperCase() ?? null;
  }
  if (fields.gstin !== undefined || fields.state_code !== undefined) {
    // Checked together: a GSTIN's first two digits are its state.
    const gstin = fields.gstin ?? body.currentGstin;
    const stateCode = fields.state_code ?? body.currentStateCode;
    if (!isValidGstin(gstin, stateCode)) {
      return { error: 'GSTIN must be 15 characters and start with the state code' };
    }
  }
  if (!partial || has('invoicePrefix')) {
    fields.invoice_prefix = text(body.invoicePrefix)?.toUpperCase() ?? null;
    if (!INVOICE_PREFIX_PATTERN.test(fields.invoice_prefix || '')) {
      return { error: 'Invoice prefix must be 1–4 letters or digits' };
    }
  }
  for (const [key, column] of [
    ['tradeName', 'trade_name'], ['address', 'address'], ['phone', 'phone'], ['email', 'email'],
    ['bankName', 'bank_name'], ['bankAccount', 'bank_account'], ['bankIfsc', 'bank_ifsc'],
    ['city', 'city'], ['pincode', 'pincode'], ['upiId', 'upi_id'],
  ]) {
    if (!partial || has(key)) fields[column] = text(body[key]);
  }
  // The e-invoice and e-way bill portals reject anything but a 6-digit PIN.
  if (fields.pincode && !/^[1-9]\d{5}$/.test(fields.pincode)) return { error: 'PIN code must be 6 digits' };
  if (fields.upi_id && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(fields.upi_id)) return { error: 'UPI ID looks like name@bank' };
  if (!partial || has('einvoiceEnabled')) fields.einvoice_enabled = body.einvoiceEnabled !== false;
  if (!partial || has('ewbThreshold')) {
    const threshold = body.ewbThreshold === '' || body.ewbThreshold == null ? 50000 : Number(body.ewbThreshold);
    if (!Number.isFinite(threshold) || threshold < 0) return { error: 'E-way bill threshold must be a positive amount' };
    fields.ewb_threshold = threshold;
  }
  if (partial && has('isActive')) fields.is_active = Boolean(body.isActive);
  return { fields };
}

export async function GET(request) {
  const gate = await guard(request, { requireManage: false });
  if (gate.error) return gate.error;

  try {
    const rows = await sql(`SELECT ${COLUMNS} FROM stock_businesses ORDER BY is_active DESC, legal_name`, []);
    return NextResponse.json({
      businesses: rows.map(serializeBusiness),
      states: GST_STATES,
      canManage: getRoleFlags(gate.appUser.role).canManageAttendance,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load businesses', detail: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    const body = await request.json().catch(() => ({}));
    const { fields, error } = readFields(body, { partial: false });
    if (error) return NextResponse.json({ error }, { status: 400 });

    const columns = Object.keys(fields);
    const rows = await sql(
      `INSERT INTO stock_businesses (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING ${COLUMNS}`,
      Object.values(fields)
    );

    await recordTimelineEvent({
      eventType: 'other',
      entityType: 'business',
      entityId: rows[0].id,
      summary: `${gate.appUser.name} added the business "${fields.legal_name}" (${fields.gstin})`,
      userId: gate.appUser.id,
    });

    return NextResponse.json({ business: serializeBusiness(rows[0]) }, { status: 201 });
  } catch (error) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Another business already uses that GSTIN or invoice prefix' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to add business', detail: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;

  try {
    const body = await request.json().catch(() => ({}));
    const businessId = Number(body?.businessId);
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return NextResponse.json({ error: 'Invalid businessId' }, { status: 400 });
    }

    const current = (await sql('SELECT gstin, state_code, invoice_prefix FROM stock_businesses WHERE id = $1', [businessId]))[0];
    if (!current) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    const { fields, error } = readFields(
      { ...body, currentGstin: current.gstin, currentStateCode: current.state_code },
      { partial: true }
    );
    if (error) return NextResponse.json({ error }, { status: 400 });

    // A year's invoice series must keep one prefix, so it is fixed once any
    // invoice has been numbered under it.
    if (fields.invoice_prefix && fields.invoice_prefix !== current.invoice_prefix) {
      const issued = await sql(
        'SELECT 1 FROM stock_sales_invoices WHERE business_id = $1 AND invoice_number IS NOT NULL LIMIT 1',
        [businessId]
      );
      if (issued.length) {
        return NextResponse.json({ error: 'The invoice prefix cannot change after invoices have been issued.' }, { status: 409 });
      }
    }

    const columns = Object.keys(fields);
    if (!columns.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const values = [...Object.values(fields), businessId];
    const rows = await sql(
      `UPDATE stock_businesses
          SET ${columns.map((column, i) => `${column} = $${i + 1}`).join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING ${COLUMNS}`,
      values
    );

    await recordTimelineEvent({
      eventType: 'other',
      entityType: 'business',
      entityId: businessId,
      summary: `${gate.appUser.name} updated the business "${rows[0].legal_name}"`,
      details: { changes: fields },
      userId: gate.appUser.id,
    });

    return NextResponse.json({ business: serializeBusiness(rows[0]) });
  } catch (error) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Another business already uses that GSTIN or invoice prefix' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update business', detail: error.message }, { status: 500 });
  }
}
