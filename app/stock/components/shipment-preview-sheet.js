'use client';

import { useCallback, useMemo } from 'react';
import { Calendar, Hash, Truck, ChevronRight, FileText, Sparkles } from 'lucide-react';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { formatDateTime, INVOICE_CLASSES } from '../lib/stock-utils';

function renderDocumentPreview(document, tc) {
  if (!document?.file_url) {
    return <div className="glass-panel rounded-2xl border border-white/5 bg-white/5 p-6 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">{tc.noPreview}</div>;
  }

  if (document.mime_type?.startsWith('image/')) {
    return (
      <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-2xl">
        <img
          src={document.file_url}
          alt={document.file_name || 'Document preview'}
          className="max-h-96 w-full object-contain transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-white shadow-sm">{tc.visualVerificationHub}</div>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={document.file_url}
      title={document.file_name || 'Document preview'}
      className="h-96 w-full rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-sm"
    />
  );
}

export function ShipmentPreviewSheet({ previewState, closePreview, previewItemPagination, setPreviewItemsPage, tc, userRole, pageSize, setPageSize }) {
  const isInboundPreview = previewState.kind === 'arrival';
  const canViewPricing = ['admin', 'manager'].includes(userRole);

  const inboundMetaItems = useMemo(() => [
    { label: tc.status, value: previewState.record?.status },
    { label: tc.approval, value: previewState.record?.approval_status },
    { label: tc.driver, value: previewState.record?.driver_name },
    { label: tc.originCity, value: previewState.record?.origin_city },
    { label: tc.destinationWarehouse, value: previewState.record?.destination_warehouse_name },
    { label: tc.paymentStatus, value: previewState.record?.payment_status },
    { label: tc.totalWhole, value: previewState.record?.total_whole_qty },
    { label: tc.totalBroken, value: previewState.record?.total_broken_qty },
    { label: tc.notes, value: previewState.record?.notes },
  ], [previewState.record, tc]);

  const hasTechnicalSubBar = Boolean(previewState.record?.eway_bill_number || previewState.record?.irn_number);

  const stockSections = useMemo(() => {
    const isBagItem = previewState.record?.unit_of_measure === 'bag';
    return previewState.kind === 'stock'
    ? [
      {
        title: tc.itemDetails,
        children: (
          <PreviewKeyValueGrid
            items={[
              { label: tc.name, value: previewState.record?.name },
              { label: tc.finish, value: previewState.record?.finish },
              { label: tc.quality, value: previewState.record?.grade },
              {
                label: isBagItem ? tc.weightPerBag : tc.size,
                value: isBagItem
                  ? (previewState.record?.weight_per_unit_kg ? `${previewState.record.weight_per_unit_kg} kg/bag` : previewState.record?.type_name || '—')
                  : previewState.record?.size_label,
              },
              { label: isBagItem ? tc.qtyBags : tc.wholeQty, value: previewState.record?.current_whole_qty },
              ...(!isBagItem ? [{ label: tc.brokenQty, value: previewState.record?.current_broken_qty }] : []),
              { label: tc.reorderLevel, value: previewState.record?.reorder_level },
            ]}
          />
        ),
      },
    ]
    : [
      {
        title: tc.details,
        children: isInboundPreview ? (
          <div className={INVOICE_CLASSES.surface}>
            <div className={INVOICE_CLASSES.commandCard}>
              <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-start">
                <div className="space-y-4">
                   <div className="space-y-1">
                    <nav className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                      <span>{tc.logisticsOrigin}</span>
                      <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                      <span className="text-brand-primary">{tc.node}</span>
                    </nav>
                    <div className={INVOICE_CLASSES.supplierTitle}>{previewState.record?.supplier_name || 'Supplier'}</div>
                  </div>
                  <div className="space-y-1.5 opacity-80">
                    <div className={INVOICE_CLASSES.supplierMeta}>GSTIN: {previewState.record?.supplier_gst_number || '—'}</div>
                    <div className={INVOICE_CLASSES.supplierMeta}>{previewState.record?.supplier_address || 'Address not available'}</div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-100 shadow-lg">
                    {previewState.record?.shipment_number || '—'}
                  </div>
                </div>
                <div className={INVOICE_CLASSES.logisticsGrid}>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Hash className="h-2.5 w-2.5" />{tc.invoiceNoLabel}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.invoice_number || '—'}</div>
                  </div>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Calendar className="h-2.5 w-2.5" />{tc.date}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.invoice_date ? formatDateTime(previewState.record?.invoice_date) : '—'}</div>
                  </div>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Truck className="h-2.5 w-2.5" />{tc.vehicleNo}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.truck_license_plate || previewState.record?.truck_number || '—'}</div>
                  </div>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Truck className="h-2.5 w-2.5" />{tc.transporter}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.transporter_name || '—'}</div>
                  </div>
                </div>
              </div>
            </div>
            {hasTechnicalSubBar ? (
              <div className="px-5 pb-5">
                <div className={INVOICE_CLASSES.subBar}>
                  {previewState.record?.eway_bill_number ? <span>E-WAY: {previewState.record?.eway_bill_number}</span> : null}
                  {previewState.record?.irn_number ? <span>IRN: {previewState.record?.irn_number}</span> : null}
                </div>
              </div>
            ) : null}
            <div className="px-5 pb-5">
              <PreviewKeyValueGrid items={inboundMetaItems} />
            </div>
          </div>
        ) : (
          <div className={INVOICE_CLASSES.surface}>
            <div className={INVOICE_CLASSES.commandCard}>
              <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-start">
                <div className="space-y-4">
                   <div className="space-y-1">
                    <nav className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                      <span>{tc.targetEntity}</span>
                      <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                      <span className="text-brand-primary">{tc.terminal}</span>
                    </nav>
                    <div className={INVOICE_CLASSES.supplierTitle}>{previewState.record?.customer_name || 'Customer'}</div>
                  </div>
                   <div className="space-y-1.5 opacity-80">
                    <div className={INVOICE_CLASSES.supplierMeta}>CONTACT: {previewState.record?.customer_phone_number || '—'}</div>
                    <div className={INVOICE_CLASSES.supplierMeta}>{previewState.record?.customer_address || 'Address not available'}</div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-100 shadow-lg">
                    {previewState.record?.shipment_number || '—'}
                  </div>
                </div>
                <div className={INVOICE_CLASSES.logisticsGrid}>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Hash className="h-2.5 w-2.5" />{tc.invoiceNoLabel}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.invoice_number || '—'}</div>
                  </div>
                   <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Calendar className="h-2.5 w-2.5" />{tc.date}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.dispatch_date ? formatDateTime(previewState.record?.dispatch_date) : '—'}</div>
                  </div>
                   <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Truck className="h-2.5 w-2.5" />{tc.vehicleNo}</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.truck_license_plate || previewState.record?.truck_number || '—'}</div>
                  </div>
                  <div className={INVOICE_CLASSES.logisticsCell}>
                    <div className={INVOICE_CLASSES.logisticsLabel}><Hash className="h-2.5 w-2.5" />GATEPASS</div>
                    <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.gatepass_number || '—'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <PreviewKeyValueGrid
                items={[
                  { label: tc.status, value: previewState.record?.status },
                  { label: tc.approval, value: previewState.record?.approval_status },
                  { label: tc.salesperson, value: previewState.record?.salesperson_name },
                  { label: tc.driver, value: previewState.record?.driver_name },
                  { label: tc.totalWhole, value: previewState.record?.total_whole_qty },
                  { label: tc.totalBroken, value: previewState.record?.total_broken_qty },
                  { label: tc.returnWhole, value: previewState.record?.total_return_whole_qty },
                  { label: tc.returnBroken, value: previewState.record?.total_return_broken_qty },
                  ...(canViewPricing && Number(previewState.record?.total_selling_price_excl || 0) > 0 ? [
                    {
                      label: tc.totalSellingExcl ?? 'Total (excl. GST)',
                      value: `₹${Number(previewState.record.total_selling_price_excl).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
                    },
                    {
                      label: tc.totalSellingIncl ?? 'Total (incl. 18% GST)',
                      value: `₹${(Number(previewState.record.total_selling_price_excl) * 1.18).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
                    },
                  ] : []),
                  { label: tc.notes, value: previewState.record?.notes },
                ]}
              />
            </div>
          </div>
        ),
      },
      previewState.items?.length
        ? {
          title: tc.itemsTitle,
          children: (
            <>
              <div className={INVOICE_CLASSES.mobileGrid}>
                {previewItemPagination.rows.map((item, index) => (
                  <article key={`shipment-item-${item.id || index}`} className={INVOICE_CLASSES.mobileCard}>
                    <div className={INVOICE_CLASSES.mobileCardHeader}>{tc.line} {index + 1}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className={INVOICE_CLASSES.mobileKey}>{tc.description}</div>
                        <div className={INVOICE_CLASSES.mobileValue}>{item.item_name || '—'} {item.finish ? `(${item.finish})` : ''}</div>
                      </div>
                      <div>
                        <div className={INVOICE_CLASSES.mobileKey}>{item.unit_of_measure === 'bag' ? (tc.weightPerBag || 'Weight') : tc.size}</div>
                        <div className={INVOICE_CLASSES.mobileValue}>{item.unit_of_measure === 'bag' ? (item.weight_per_unit_kg ? `${item.weight_per_unit_kg} kg` : (item.type_name || '—')) : (item.size_label || '—')}</div>
                      </div>
                      {isInboundPreview ? (
                        item.unit_of_measure === 'bag' ? (
                          <>
                            <div>
                              <div className={INVOICE_CLASSES.mobileKey}>{tc.hsn}</div>
                              <div className={INVOICE_CLASSES.mobileValue}>{item.hsn_code || '—'}</div>
                            </div>
                            <div>
                              <div className={INVOICE_CLASSES.mobileKey}>{tc.qtyBags}</div>
                              <div className={INVOICE_CLASSES.mobileValue}>{item.received_whole_qty ?? 0}</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className={INVOICE_CLASSES.mobileKey}>{tc.hsn}</div>
                              <div className={INVOICE_CLASSES.mobileValue}>{item.hsn_code || '—'}</div>
                            </div>
                            <div>
                              <div className={INVOICE_CLASSES.mobileKey}>{tc.wholeBox}</div>
                              <div className={INVOICE_CLASSES.mobileValue}>{item.received_whole_qty ?? item.loaded_whole_qty ?? 0}</div>
                            </div>
                            <div>
                              <div className={INVOICE_CLASSES.mobileKey}>{tc.orderedSqm}</div>
                              <div className={INVOICE_CLASSES.mobileValue}>{item.ordered_qty_sqm != null ? Number(item.ordered_qty_sqm).toFixed(3) : '—'}</div>
                            </div>
                            <div>
                              <div className={INVOICE_CLASSES.mobileKey}>{tc.wholeSqm}</div>
                              <div className={INVOICE_CLASSES.mobileValue}>{item.whole_qty_sqm != null ? Number(item.whole_qty_sqm).toFixed(3) : '—'}</div>
                            </div>
                            <div>
                              <div className={INVOICE_CLASSES.mobileKey}>{tc.brokenSqm}</div>
                              <div className={INVOICE_CLASSES.mobileValue}>{item.broken_qty_sqm != null ? Number(item.broken_qty_sqm).toFixed(3) : '—'}</div>
                            </div>
                            <div className="col-span-2">
                              <div className={INVOICE_CLASSES.mobileKey}>{tc.totalSqmQty}</div>
                              <div className={INVOICE_CLASSES.mobileValue}>
                                {item.qty_sqm != null ? Number(item.qty_sqm).toFixed(3) : Number((item.received_whole_qty ?? 0) + (item.received_broken_qty ?? 0)).toFixed(0)}
                              </div>
                            </div>
                          </>
                        )
                      ) : item.unit_of_measure === 'bag' ? (
                        <>
                          <div>
                            <div className={INVOICE_CLASSES.mobileKey}>{tc.qtyBags}</div>
                            <div className={INVOICE_CLASSES.mobileValue}>{item.loaded_whole_qty ?? 0}</div>
                          </div>
                          <div>
                            <div className={INVOICE_CLASSES.mobileKey}>{tc.returnQtyBags}</div>
                            <div className={INVOICE_CLASSES.mobileValue}>{item.returned_whole_qty ?? 0}</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <div className={INVOICE_CLASSES.mobileKey}>{item.sell_unit === 'piece' ? (tc.pieces ?? 'Pieces') : (tc.boxes ?? 'Boxes')}</div>
                            <div className={INVOICE_CLASSES.mobileValue}>{item.loaded_whole_qty ?? 0}</div>
                          </div>
                          <div>
                            <div className={INVOICE_CLASSES.mobileKey}>{tc.loadedBroken}</div>
                            <div className={INVOICE_CLASSES.mobileValue}>{item.loaded_broken_qty ?? 0}</div>
                          </div>
                          {canViewPricing && item.rate_per_unit != null ? (
                            <>
                              <div>
                                <div className={INVOICE_CLASSES.mobileKey}>{item.sell_unit === 'piece' ? (tc.ratePerPiece ?? 'Rate/Piece') : (tc.ratePerBox ?? 'Rate/Box')}</div>
                                <div className={INVOICE_CLASSES.mobileValue}>₹{Number(item.rate_per_unit).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                              </div>
                              <div>
                                <div className={INVOICE_CLASSES.mobileKey}>{tc.lineTotal ?? 'Line Total'}</div>
                                <div className={INVOICE_CLASSES.mobileValue}>₹{(Number(item.loaded_whole_qty ?? 0) * Number(item.rate_per_unit)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                              </div>
                            </>
                          ) : null}
                          <div>
                            <div className={INVOICE_CLASSES.mobileKey}>{tc.returnWhole}</div>
                            <div className={INVOICE_CLASSES.mobileValue}>{item.returned_whole_qty ?? 0}</div>
                          </div>
                          <div>
                            <div className={INVOICE_CLASSES.mobileKey}>{tc.returnBroken}</div>
                            <div className={INVOICE_CLASSES.mobileValue}>{item.returned_broken_qty ?? 0}</div>
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
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
            </>
          ),
        }
        : null,
      previewState.documents?.length
        ? {
          title: tc.linkedDocuments,
          children: (
            <div className="grid gap-6 xl:grid-cols-2">
              {previewState.documents.map((document) => (
                <section key={document.id} className="glass-panel overflow-hidden rounded-2xl border border-white/5 shadow-xl transition-all duration-300 hover:shadow-2xl">
                  <div className="border-b border-white/5 bg-slate-900/40 px-5 py-4">
                    <nav className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">
                      <span>{tc.intelligenceCase}</span>
                      <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                      <span className="text-brand-primary">{document.document_type}</span>
                    </nav>
                    <div className="mt-2 text-base font-black text-slate-900 dark:text-white tracking-tight">{document.document_number || (language === 'hi' ? 'दस्तावेज़' : 'Document')}</div>
                    <div className="mt-1 truncate text-[11px] font-bold text-slate-500 opacity-60">{document.file_name}</div>
                  </div>
                  <div className="p-5">{renderDocumentPreview(document, tc)}</div>
                </section>
              ))}
            </div>
          ),
        }
        : null,
    ];
  }, [previewState, tc, isInboundPreview, previewItemPagination, setPreviewItemsPage, inboundMetaItems, pageSize, setPageSize]);

  const handleOpenChange = useCallback((open) => { if (!open) closePreview(); }, [closePreview]);

  return (
    <EntryPreviewSheet
      open={previewState.open}
      onOpenChange={handleOpenChange}
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
