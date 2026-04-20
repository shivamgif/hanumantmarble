'use client';

import { Calendar, Hash, Truck } from 'lucide-react';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { formatDateTime, INVOICE_CLASSES } from '../lib/stock-utils';

function renderDocumentPreview(document) {
  if (!document?.file_url) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No preview available.</div>;
  }

  if (document.mime_type?.startsWith('image/')) {
    return (
      <img
        src={document.file_url}
        alt={document.file_name || 'Document preview'}
        className="max-h-80 w-full rounded-2xl border border-slate-200 object-contain bg-black/5"
      />
    );
  }

  return (
    <iframe
      src={document.file_url}
      title={document.file_name || 'Document preview'}
      className="h-80 w-full rounded-2xl border border-slate-200 bg-white"
    />
  );
}

export function ShipmentPreviewSheet({ previewState, closePreview, previewItemPagination, setPreviewItemsPage, tc }) {
  const isInboundPreview = previewState.kind === 'arrival';

  const inboundMetaItems = [
    { label: 'Status', value: previewState.record?.status },
    { label: 'Approval', value: previewState.record?.approval_status },
    { label: 'Driver', value: previewState.record?.driver_name },
    { label: 'Origin City', value: previewState.record?.origin_city },
    { label: 'Destination Warehouse', value: previewState.record?.destination_warehouse_name },
    { label: 'Payment Status', value: previewState.record?.payment_status },
    { label: 'Total Whole', value: previewState.record?.total_whole_qty },
    { label: 'Total Broken', value: previewState.record?.total_broken_qty },
    { label: 'Notes', value: previewState.record?.notes },
  ];

  const hasTechnicalSubBar = Boolean(previewState.record?.eway_bill_number || previewState.record?.irn_number);

  const stockSections = previewState.kind === 'stock'
    ? [
      {
        title: 'Item Details',
        children: (
          <PreviewKeyValueGrid
            items={[
              { label: 'Name', value: previewState.record?.name },
              { label: 'Finish', value: previewState.record?.finish },
              { label: 'Quality', value: previewState.record?.grade },
              { label: 'Size', value: previewState.record?.size_label },
              { label: 'Whole Qty', value: previewState.record?.current_whole_qty },
              { label: 'Broken Qty', value: previewState.record?.current_broken_qty },
              { label: 'Reorder Level', value: previewState.record?.reorder_level },
            ]}
          />
        ),
      },
    ]
    : [
      {
        title: 'Details',
        children: isInboundPreview ? (
          <div className={INVOICE_CLASSES.surface}>
            <div className={INVOICE_CLASSES.commandCard}>
              <div className="grid gap-4 md:grid-cols-[1.15fr_1fr] md:items-start">
                <div>
                  <div className={INVOICE_CLASSES.supplierTitle}>{previewState.record?.supplier_name || 'Supplier'}</div>
                  <div className={INVOICE_CLASSES.supplierMeta}>GSTIN: {previewState.record?.supplier_gst_number || '—'}</div>
                  <div className={INVOICE_CLASSES.supplierMeta}>{previewState.record?.supplier_address || 'Address not available'}</div>
                  <div className="mt-3 font-mono text-xs font-semibold text-[#E07A00]">{previewState.record?.shipment_number || '—'}</div>
                </div>
                <div className={INVOICE_CLASSES.logisticsGrid}>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Hash className="h-3 w-3" />{tc.invoiceNoLabel}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.invoice_number || '—'}</div>
                  </div>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Calendar className="h-3 w-3" />{tc.date}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.invoice_date ? formatDateTime(previewState.record?.invoice_date) : '—'}</div>
                  </div>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Truck className="h-3 w-3" />{tc.vehicleNo}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.truck_license_plate || previewState.record?.truck_number || '—'}</div>
                  </div>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Truck className="h-3 w-3" />{tc.transporter}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.transporter_name || '—'}</div>
                  </div>
                </div>
              </div>
            </div>
            {hasTechnicalSubBar ? (
              <div className="px-4 pb-4">
                <div className={INVOICE_CLASSES.subBar}>
                  {previewState.record?.eway_bill_number ? <span>E-WAY: {previewState.record?.eway_bill_number}</span> : null}
                  {previewState.record?.irn_number ? <span>IRN: {previewState.record?.irn_number}</span> : null}
                </div>
              </div>
            ) : null}
            <div className="px-4 pb-4">
              <PreviewKeyValueGrid items={inboundMetaItems} />
            </div>
          </div>
        ) : (
          <PreviewKeyValueGrid
            items={[
              { label: 'Shipment No.', value: previewState.record?.shipment_number },
              { label: 'Status', value: previewState.record?.status },
              { label: 'Approval', value: previewState.record?.approval_status },
              { label: 'Truck', value: previewState.record?.truck_license_plate || previewState.record?.truck_number },
              { label: 'Driver', value: previewState.record?.driver_name },
              { label: 'Invoice No.', value: previewState.record?.invoice_number },
              { label: 'Gatepass No.', value: previewState.record?.gatepass_number },
              { label: 'Customer', value: previewState.record?.customer_name },
              { label: 'Total Whole', value: previewState.record?.total_whole_qty },
              { label: 'Total Broken', value: previewState.record?.total_broken_qty },
              { label: 'Notes', value: previewState.record?.notes },
            ]}
          />
        ),
      },
      previewState.items?.length
        ? {
          title:'Line Items',
          children: (
            <>
              {isInboundPreview ? (
                <div className={INVOICE_CLASSES.mobileGrid}>
                  {previewItemPagination.rows.map((item, index) => (
                    <article key={`inbound-mobile-item-${item.id || index}`} className={INVOICE_CLASSES.mobileCard}>
                      <div className={INVOICE_CLASSES.mobileCardHeader}>Line {index + 1}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <div className={INVOICE_CLASSES.mobileKey}>{tc.description}</div>
                          <div className={INVOICE_CLASSES.mobileValue}>{item.item_name || '—'} {item.finish ? `(${item.finish})` : ''}</div>
                        </div>
                        <div>
                          <div className={INVOICE_CLASSES.mobileKey}>HSN</div>
                          <div className={INVOICE_CLASSES.mobileValue}>{item.hsn_code || '—'}</div>
                        </div>
                        <div>
                          <div className={INVOICE_CLASSES.mobileKey}>Size</div>
                          <div className={INVOICE_CLASSES.mobileValue}>{item.size_label || '—'}</div>
                        </div>
                        <div>
                          <div className={INVOICE_CLASSES.mobileKey}>{tc.wholeBox}</div>
                          <div className={INVOICE_CLASSES.mobileValue}>{item.received_whole_qty ?? item.loaded_whole_qty ?? 0}</div>
                        </div>
                        <div>
                          <div className={INVOICE_CLASSES.mobileKey}>Ordered (sqm)</div>
                          <div className={INVOICE_CLASSES.mobileValue}>{item.ordered_qty_sqm != null ? Number(item.ordered_qty_sqm).toFixed(3) : '—'}</div>
                        </div>
                        <div>
                          <div className={INVOICE_CLASSES.mobileKey}>Whole (sqm)</div>
                          <div className={INVOICE_CLASSES.mobileValue}>{item.whole_qty_sqm != null ? Number(item.whole_qty_sqm).toFixed(3) : '—'}</div>
                        </div>
                        <div>
                          <div className={INVOICE_CLASSES.mobileKey}>Broken (sqm)</div>
                          <div className={INVOICE_CLASSES.mobileValue}>{item.broken_qty_sqm != null ? Number(item.broken_qty_sqm).toFixed(3) : '—'}</div>
                        </div>
                        <div className="col-span-2">
                          <div className={INVOICE_CLASSES.mobileKey}>{tc.totalSqmQty}</div>
                          <div className={INVOICE_CLASSES.mobileValue}>
                            {item.qty_sqm != null ? Number(item.qty_sqm).toFixed(3) : Number((item.received_whole_qty ?? 0) + (item.received_broken_qty ?? 0)).toFixed(0)}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              <PaginationControls
                page={previewItemPagination.page}
                pageCount={previewItemPagination.pageCount}
                total={previewItemPagination.total}
                pageSize={DEFAULT_PAGE_SIZE}
                onPageChange={setPreviewItemsPage}
                labels={{
                  showing: tc.paginationShowing,
                  of: tc.paginationOf,
                  previous: tc.paginationPrevious,
                  next: tc.paginationNext,
                  page: tc.paginationPage,
                }}
              />
            </>
          ),
        }
        : null,
      previewState.documents?.length
        ? {
          title: 'Linked Documents',
          children: (
            <div className="grid gap-4 xl:grid-cols-2">
              {previewState.documents.map((document) => (
                <section key={document.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="border-b border-border bg-muted/40 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{document.document_type}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{document.document_number || document.file_name}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{document.file_name}</div>
                  </div>
                  <div className="p-4">{renderDocumentPreview(document)}</div>
                </section>
              ))}
            </div>
          ),
        }
        : null,
    ];

  return (
    <EntryPreviewSheet
      open={previewState.open}
      onOpenChange={(open) => { if (!open) closePreview(); }}
      title={previewState.title}
      description={previewState.description}
      summary={
        previewState.loading ? (
          <div className="text-sm text-slate-500">{tc.loadingPreview}</div>
        ) : previewState.error ? (
          <div className="text-sm text-red-600">{previewState.error}</div>
        ) : null
      }
      sections={stockSections}
    />
  );
}
