'use client';

import { useCallback, useMemo } from 'react';
import { Check, X, MessageSquare, IndianRupee, PackageCheck, Loader2, ExternalLink, FileText } from 'lucide-react';
import EntryPreviewSheet, { PreviewKeyValueGrid, PreviewStats } from '@/components/ui/entry-preview-sheet';
import { Badge } from '@/components/ui/badge';
import PaginationControls from '@/components/ui/pagination-controls';
import { formatDateTime, getStatusVariant } from '../lib/stock-utils';
import { ShowroomSection } from './showroom-section';
import { showroomSplit } from '@/lib/stock-showroom';

const num = (v, digits = 2) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });
const money = (v, digits = 0) => `₹${num(v, digits)}`;
// Secondary bits of a line ("HSN 6907", "12.5 sqm"), dropping the empty ones.
const joinBits = (...bits) => bits.filter(Boolean).join(' · ');

function ActionFooter({ record, kind, userRole, actionLoading, onApprove, onReject, onRequestChanges, onMarkPaid, onMarkDelivered }) {
  const canAct = ['admin', 'manager'].includes(userRole);
  if (!canAct || !record) return null;

  const approvalStatus = String(record.approval_status || '').toLowerCase();
  const paymentStatus = String(record.payment_status || '').toLowerCase();
  const deliveredDate = record.delivered_date;
  const shipmentId = record.id;
  const actionType = kind === 'arrival' ? 'inbound-shipments' : 'outbound-shipments';

  const buttons = [];
  const baseBtn = 'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const primary = `${baseBtn} bg-primary font-semibold text-primary-foreground hover:bg-primary/90`;
  const outline = `${baseBtn} border border-border bg-card text-slate-700 hover:bg-muted dark:text-slate-200`;
  const danger = `${baseBtn} border border-rose-600/30 bg-card text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10`;

  const isLoading = (action) => actionLoading === `${actionType}-${shipmentId}-${action}`;
  const anyLoading = Boolean(actionLoading);
  const icon = (action, Icon) => (isLoading(action) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />);

  if (approvalStatus === 'pending' || approvalStatus === 'reviewed' || approvalStatus === 'changes_requested') {
    if (onRequestChanges) {
      buttons.push(
        <button key="changes" type="button" disabled={anyLoading} onClick={() => onRequestChanges(kind, record)} className={outline}>
          {icon('request_changes', MessageSquare)} Request Changes
        </button>
      );
    }
    if (onReject) {
      buttons.push(
        <button key="reject" type="button" disabled={anyLoading} onClick={() => onReject(kind, record)} className={danger}>
          {icon('reject', X)} Reject
        </button>
      );
    }
    if (onApprove) {
      buttons.push(
        <button key="approve" type="button" disabled={anyLoading} onClick={() => onApprove(kind, record)} className={primary}>
          {icon('approve', Check)} Approve
        </button>
      );
    }
  }

  if (approvalStatus === 'approved') {
    if (paymentStatus && paymentStatus !== 'paid' && onMarkPaid) {
      buttons.push(
        <button key="paid" type="button" disabled={anyLoading} onClick={() => onMarkPaid(kind, record)} className={outline}>
          {icon('mark_paid', IndianRupee)} Mark Paid
        </button>
      );
    }
    if (kind === 'dispatch' && !deliveredDate && onMarkDelivered) {
      buttons.push(
        <button key="delivered" type="button" disabled={anyLoading} onClick={() => onMarkDelivered(kind, record)} className={primary}>
          {icon('mark_delivered', PackageCheck)} Mark Delivered
        </button>
      );
    }
  }

  if (buttons.length === 0) return null;

  return <div className="flex flex-wrap items-center justify-end gap-2">{buttons}</div>;
}

function DocumentCard({ document, tc }) {
  const isImage = document.mime_type?.startsWith('image/');
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {joinBits(document.document_type, document.document_number) || (tc.document ?? 'Document')}
          </p>
          {document.file_name ? <p className="truncate text-xs text-slate-500">{document.file_name}</p> : null}
        </div>
        {document.file_url ? (
          <a href={document.file_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-primary hover:underline">
            Open <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      {!document.file_url ? (
        <p className="px-3 py-6 text-center text-xs text-slate-500">{tc.noPreview}</p>
      ) : isImage ? (
        <img src={document.file_url} alt={document.file_name || 'Document preview'} className="max-h-56 w-full bg-muted object-contain" />
      ) : (
        <iframe src={document.file_url} title={document.file_name || 'Document preview'} className="h-64 w-full bg-muted" />
      )}
    </section>
  );
}

// One line per item: name and specs on the left, quantity and money on the right.
function ItemRow({ item, isInbound, canViewPricing, tc }) {
  const uom = item.unit_of_measure;
  const spec = uom === 'bag'
    ? (item.weight_per_unit_kg ? `${item.weight_per_unit_kg} kg/bag` : item.type_name)
    : uom === 'sqft'
      ? (item.slab_size_label || item.type_name)
      : item.size_label;
  const boxesLabel = item.sell_unit === 'piece' ? (tc.pieces ?? 'pieces') : (tc.boxes ?? 'boxes');

  let qty;
  let qtySub = null;
  let money1 = null;
  const returns = [];
  if (isInbound) {
    if (uom === 'sqft') {
      qty = `${num(item.received_qty_sqft, 3)} sqft`;
      if (canViewPricing && item.cost_per_sqft != null) money1 = `${money(item.cost_per_sqft, 2)}/sqft · ${money(item.total_cost, 2)}`;
    } else if (uom === 'bag') {
      qty = `${item.received_whole_qty ?? 0} bags`;
    } else {
      qty = `${item.received_whole_qty ?? item.loaded_whole_qty ?? 0} ${tc.boxes ?? 'boxes'}`;
      qtySub = item.qty_sqm != null ? `${Number(item.qty_sqm).toFixed(3)} sqm` : null;
    }
  } else if (uom === 'sqft') {
    qty = `${num(item.qty_sqft, 3)} sqft`;
    if (canViewPricing && item.rate_per_unit != null) money1 = `${money(item.rate_per_unit, 2)}/sqft · ${money(Number(item.qty_sqft ?? 0) * Number(item.rate_per_unit), 2)}`;
    if (Number(item.returned_qty_sqft || 0) > 0) returns.push(`${num(item.returned_qty_sqft, 3)} sqft`);
  } else if (uom === 'bag') {
    qty = `${item.loaded_whole_qty ?? 0} bags`;
    if (Number(item.returned_whole_qty || 0) > 0) returns.push(`${item.returned_whole_qty} bags`);
  } else {
    qty = `${item.loaded_whole_qty ?? 0} ${boxesLabel}`;
    if (Number(item.loaded_broken_qty || 0) > 0) qtySub = `+ ${item.loaded_broken_qty} broken`;
    if (canViewPricing && item.rate_per_unit != null) money1 = `${money(item.rate_per_unit, 2)} each · ${money(Number(item.loaded_whole_qty ?? 0) * Number(item.rate_per_unit), 2)}`;
    if (Number(item.returned_whole_qty || 0) > 0) returns.push(`${item.returned_whole_qty} whole`);
    if (Number(item.returned_broken_qty || 0) > 0) returns.push(`${item.returned_broken_qty} broken`);
  }

  const detail = joinBits(
    spec,
    item.hsn_code ? `HSN ${item.hsn_code}` : null,
    isInbound && uom !== 'sqft' && uom !== 'bag' && Number(item.broken_qty_sqm || 0) > 0 ? `${Number(item.broken_qty_sqm).toFixed(3)} sqm broken` : null,
  );

  return (
    <li className="flex items-start justify-between gap-4 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {item.item_name || '—'}
          {item.finish ? <span className="font-normal text-slate-500"> · {item.finish}</span> : null}
        </p>
        {detail ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p> : null}
        {returns.length ? <p className="mt-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">{tc.returned ?? 'Returned'} {returns.join(', ')}</p> : null}
        {isInbound && Number(item.discount_amount || 0) > 0 ? (
          <p className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">− {money(item.discount_amount, 2)} discount</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">{qty}</p>
        {qtySub ? <p className="text-xs tabular-nums text-slate-500">{qtySub}</p> : null}
        {money1 ? <p className="text-xs tabular-nums text-slate-500">{money1}</p> : null}
      </div>
    </li>
  );
}

export function ShipmentPreviewSheet({ previewState, closePreview, previewItemPagination, setPreviewItemsPage, tc, userRole, pageSize, setPageSize, onApprove, onReject, onRequestChanges, onMarkPaid, onMarkDelivered, actionLoading, onShowroomChanged }) {
  const isInboundPreview = previewState.kind === 'arrival';
  const isStock = previewState.kind === 'stock';
  const r = previewState.record || {};
  // A shipment with none of the three was logged with no transport paperwork at
  // all (see refineTransporter in lib/forms/stock-forms.js) — say so once,
  // rather than rendering bare dashes that look like a bug.
  const transportNotRecorded = isInboundPreview
    && !r.transporter_name && !r.truck_license_plate && !r.truck_number && !r.driver_name;
  const canViewPricing = ['admin', 'manager'].includes(userRole);
  const totalItems = previewState.items?.length || 0;
  // Paginate only when the lines outrun a page; a pager under three rows is noise.
  const isCompactItems = totalItems > 0 && totalItems <= pageSize;
  const lineDiscountTotal = useMemo(
    () => (previewState.items || []).reduce((sum, item) => sum + Number(item.discount_amount || 0), 0),
    [previewState.items]
  );
  // Stone shipments carry no whole/broken counts, so the totals must sum the
  // sqft columns or they report 0 for a real delivery.
  const stoneSqftTotal = useMemo(
    () => (previewState.items || [])
      .filter((item) => item.unit_of_measure === 'sqft')
      .reduce((sum, item) => sum + Number(item.received_qty_sqft ?? item.qty_sqft ?? 0), 0),
    [previewState.items]
  );

  // Header: who it's with, then the paperwork identity and state on one line.
  const shipmentDate = isInboundPreview ? r.arrival_date : (r.dispatch_date || r.created_at);
  const sheetTitle = isStock
    ? (r.name || previewState.title)
    : ((isInboundPreview ? r.supplier_name : r.customer_name) || previewState.title);
  const sheetDescription = isStock
    ? joinBits(r.sku, r.size_label || r.last_slab_size_label, r.division_name || r.brand_name) || previewState.description
    : (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-xs text-brand-primary">{r.shipment_number || previewState.title}</span>
        {shipmentDate ? <><span aria-hidden="true">·</span><span>{formatDateTime(shipmentDate)}</span></> : null}
        {r.status ? <Badge variant={getStatusVariant(r.status)}>{r.status}</Badge> : null}
        {r.approval_status && r.approval_status !== r.status ? <Badge variant={getStatusVariant(r.approval_status)}>{String(r.approval_status).replace(/_/g, ' ')}</Badge> : null}
      </span>
    );

  const sections = useMemo(() => {
    if (isStock) {
      const isBagItem = r.unit_of_measure === 'bag';
      const isStoneItem = r.unit_of_measure === 'sqft';
      const showroom = showroomSplit(r);
      return [
        {
          children: (
            <PreviewStats
              items={[
                {
                  label: isBagItem ? tc.qtyBags : isStoneItem ? (tc.sqftLeft ?? 'Sqft left') : tc.wholeQty,
                  value: isStoneItem ? num(r.current_sqft) : num(r.current_whole_qty, 0),
                },
                !isBagItem && !isStoneItem ? {
                  label: tc.brokenQty,
                  value: num(r.current_broken_qty, 0),
                  tone: Number(r.current_broken_qty || 0) > 0 ? 'text-amber-700 dark:text-amber-400' : undefined,
                } : null,
                {
                  label: tc.atShowroom ?? 'At showroom',
                  value: num(showroom.total),
                  sub: showroom.installed > 0 ? `${num(showroom.cassette)} cassette · ${num(showroom.installed)} installed` : null,
                },
                { label: tc.reorderLevel, value: num(r.reorder_level, 0) },
              ]}
            />
          ),
        },
        {
          title: tc.itemDetails,
          children: (
            <PreviewKeyValueGrid
              items={[
                { label: tc.finish, value: r.finish },
                { label: tc.quality, value: r.grade },
                {
                  label: isBagItem ? tc.weightPerBag : tc.size,
                  value: isBagItem
                    ? (r.weight_per_unit_kg ? `${r.weight_per_unit_kg} kg/bag` : r.type_name)
                    : isStoneItem ? (r.last_slab_size_label || r.type_name) : r.size_label,
                },
                { label: tc.brand, value: r.brand_name },
                { label: tc.division, value: r.division_name },
              ]}
            />
          ),
        },
        {
          title: tc.showroom ?? 'Showroom',
          children: <ShowroomSection item={r} userRole={userRole} onChanged={onShowroomChanged} />,
        },
      ];
    }

    // A mixed shipment (tiles plus stone) shows both: leading with sqft alone
    // used to hide every box on the truck.
    const wholeTotal = Number(r.total_whole_qty || 0);
    const qtyStat = wholeTotal > 0 || stoneSqftTotal === 0
      ? {
        label: tc.totalWhole,
        value: num(wholeTotal, 0),
        sub: joinBits(
          Number(r.total_broken_qty || 0) > 0 ? `+ ${num(r.total_broken_qty, 0)} broken` : null,
          stoneSqftTotal > 0 ? `+ ${num(stoneSqftTotal, 3)} sqft` : null,
        ) || null,
      }
      : { label: tc.qtySqft ?? 'Total sqft', value: num(stoneSqftTotal, 3) };
    const paymentStat = r.payment_status ? {
      label: tc.paymentStatus,
      value: <span className="capitalize">{r.payment_status}</span>,
      tone: r.payment_status === 'paid' ? 'text-emerald-700 dark:text-emerald-400' : undefined,
      sub: r.paid_amount != null ? money(r.paid_amount) : null,
    } : null;

    const stats = isInboundPreview
      ? [
        qtyStat,
        r.grand_total != null ? { label: tc.grandTotal ?? 'Total', value: money(r.grand_total) } : null,
        paymentStat,
        { label: tc.itemsTitle, value: totalItems },
      ]
      : [
        qtyStat,
        canViewPricing && Number(r.total_selling_price_excl || 0) > 0
          ? { label: tc.totalSellingExcl ?? 'Total (excl. GST)', value: money(r.total_selling_price_excl), sub: `${money(Number(r.total_selling_price_excl) * 1.18)} incl. GST` }
          : null,
        paymentStat,
        { label: tc.itemsTitle, value: totalItems },
      ];

    const details = isInboundPreview
      ? [
        { label: tc.invoiceNoLabel, value: r.invoice_number },
        { label: tc.date, value: r.invoice_date ? formatDateTime(r.invoice_date) : null },
        { label: tc.route ?? 'Route', value: r.origin_city || r.destination_warehouse_name ? `${r.origin_city || '—'} → ${r.destination_warehouse_name || '—'}` : null },
        ...(transportNotRecorded
          ? [{ label: tc.transporter, value: 'Not recorded' }]
          : [
            { label: tc.vehicleNo, value: r.truck_license_plate || r.truck_number },
            { label: tc.transporter, value: r.transporter_name },
            { label: tc.driver, value: r.driver_name },
          ]),
        { label: 'GSTIN', value: r.supplier_gst_number },
        { label: 'E-way bill', value: r.eway_bill_number },
        { label: 'IRN', value: r.irn_number },
        lineDiscountTotal > 0 ? { label: tc.lineDiscount || 'Line discounts', value: money(lineDiscountTotal, 2) } : null,
        Number(r.discount_amount || 0) > 0 ? { label: tc.shipmentDiscount || 'Shipment discount', value: money(r.discount_amount, 2) } : null,
        { label: tc.address ?? 'Address', value: r.supplier_address, wide: true },
        { label: tc.notes, value: r.notes, wide: true },
      ]
      : [
        {
          label: tc.phone ?? 'Phone',
          value: r.customer_phone_number ? <a href={`tel:${r.customer_phone_number}`} className="hover:underline">{r.customer_phone_number}</a> : null,
        },
        { label: tc.invoiceNoLabel, value: r.invoice_number },
        { label: tc.salesperson, value: r.salesperson_name },
        { label: tc.vehicleNo, value: r.truck_license_plate || r.truck_number },
        { label: tc.driver, value: r.driver_name },
        { label: 'Gatepass', value: r.gatepass_number },
        Number(r.total_return_whole_qty || 0) > 0 ? { label: tc.returnWhole, value: num(r.total_return_whole_qty, 0) } : null,
        Number(r.total_return_broken_qty || 0) > 0 ? { label: tc.returnBroken, value: num(r.total_return_broken_qty, 0) } : null,
        { label: tc.address ?? 'Address', value: r.customer_address, wide: true },
        { label: tc.notes, value: r.notes, wide: true },
      ];

    const itemRows = isCompactItems ? previewState.items : previewItemPagination.rows;

    return [
      { children: <PreviewStats items={stats} /> },
      { title: tc.details, children: <PreviewKeyValueGrid items={details} /> },
      totalItems
        ? {
          title: `${tc.itemsTitle} (${totalItems})`,
          children: (
            <>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {itemRows.map((item, index) => (
                  <ItemRow key={`shipment-item-${item.id || index}`} item={item} isInbound={isInboundPreview} canViewPricing={canViewPricing} tc={tc} />
                ))}
              </ul>
              {isCompactItems ? null : (
                <PaginationControls
                  page={previewItemPagination.page}
                  pageCount={previewItemPagination.pageCount}
                  total={previewItemPagination.total}
                  pageSize={pageSize}
                  onPageChange={setPreviewItemsPage}
                  onPageSizeChange={setPageSize}
                  labels={{
                    showing: tc.paginationShowing,
                    of: tc.paginationOf,
                    previous: tc.paginationPrevious,
                    next: tc.paginationNext,
                    page: tc.paginationPage,
                  }}
                />
              )}
            </>
          ),
        }
        : null,
      previewState.documents?.length
        ? {
          title: `${tc.linkedDocuments} (${previewState.documents.length})`,
          children: (
            <div className="grid gap-3 sm:grid-cols-2">
              {previewState.documents.map((document) => <DocumentCard key={document.id} document={document} tc={tc} />)}
            </div>
          ),
        }
        : null,
    ];
  }, [isStock, r, tc, userRole, onShowroomChanged, stoneSqftTotal, isInboundPreview, totalItems, canViewPricing, transportNotRecorded, lineDiscountTotal, isCompactItems, previewState.items, previewState.documents, previewItemPagination, pageSize, setPreviewItemsPage, setPageSize]);

  const handleOpenChange = useCallback((open) => { if (!open) closePreview(); }, [closePreview]);

  return (
    <EntryPreviewSheet
      open={previewState.open}
      onOpenChange={handleOpenChange}
      title={sheetTitle}
      description={sheetDescription}
      summary={
        previewState.loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{tc.loadingPreview}</div>
        ) : previewState.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{previewState.error}</div>
        ) : null
      }
      sections={sections}
      footer={
        !isStock && !previewState.loading && !previewState.error ? (
          <ActionFooter
            record={previewState.record}
            kind={previewState.kind}
            userRole={userRole}
            actionLoading={actionLoading}
            onApprove={onApprove}
            onReject={onReject}
            onRequestChanges={onRequestChanges}
            onMarkPaid={onMarkPaid}
            onMarkDelivered={onMarkDelivered}
          />
        ) : null
      }
    />
  );
}
