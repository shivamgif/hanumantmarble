'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import PaginationControls from '@/components/ui/pagination-controls';

const copy = {
  en: {
    title: 'Document Archive',
    subtitle: 'Upload and review shipment documents for arrivals and dispatches.',
    backToDashboard: 'Back to Dashboard',
    uploadTitle: 'Upload Document',
    documentType: 'Document Type',
    entityType: 'Entity Type',
    entityId: 'Entity ID',
    documentNumber: 'Document Number',
    notes: 'Notes',
    file: 'File',
    upload: 'Upload',
    loading: 'Loading documents...',
    empty: 'No documents found.',
    refresh: 'Refresh',
    recentDocuments: 'Recent Documents',
    outboundShipment: 'Outbound Shipment',
    inboundShipment: 'Inbound Shipment',
  },
  hi: {
    title: 'दस्तावेज़ संग्रह',
    subtitle: 'आगमन और डिस्पैच के शिपमेंट दस्तावेज़ अपलोड और देखें।',
    backToDashboard: 'डैशबोर्ड पर लौटें',
    uploadTitle: 'दस्तावेज़ अपलोड करें',
    documentType: 'दस्तावेज़ प्रकार',
    entityType: 'एंटिटी प्रकार',
    entityId: 'एंटिटी आईडी',
    documentNumber: 'दस्तावेज़ नंबर',
    notes: 'टिप्पणियाँ',
    file: 'फ़ाइल',
    upload: 'अपलोड',
    loading: 'दस्तावेज़ लोड हो रहे हैं...',
    empty: 'कोई दस्तावेज़ नहीं मिला।',
    refresh: 'रीफ्रेश',
    recentDocuments: 'हाल के दस्तावेज़',
    outboundShipment: 'जाने वाला शिपमेंट',
    inboundShipment: 'आने वाला शिपमेंट',
  },
};

const documentTypeOptions = [
  { value: 'purchase_invoice', label: 'Purchase Invoice' },
  { value: 'transporter_bill', label: 'Transporter Bill' },
  { value: 'gatepass', label: 'Gatepass' },
  { value: 'sales_invoice', label: 'Sales Invoice' },
  { value: 'delivery_receipt', label: 'Delivery Receipt' },
  { value: 'customer_acknowledgement', label: 'Customer Acknowledgement' },
  { value: 'photo_evidence', label: 'Photo Evidence' },
  { value: 'other', label: 'Other' },
];

const entityTypeOptions = [
  { value: 'inbound_shipment', label: 'Inbound Shipment' },
  { value: 'outbound_shipment', label: 'Outbound Shipment' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'sales_order', label: 'Sales Order' },
  { value: 'movement', label: 'Movement' },
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'other', label: 'Other' },
];

export default function StockDocumentsPage() {
  const { language } = useLanguage();
  const t = copy[language] || copy.en;
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [documentPage, setDocumentPage] = useState(1);
  const [previewState, setPreviewState] = useState({
    open: false,
    title: '',
    description: '',
    record: null,
  });
  const [form, setForm] = useState({
    documentType: 'purchase_invoice',
    entityType: 'inbound_shipment',
    entityId: '',
    documentNumber: '',
    notes: '',
    file: null,
  });

  const queryString = useMemo(() => new URLSearchParams({ limit: '100' }).toString(), []);

  useEffect(() => {
    let mounted = true;

    async function loadDocuments() {
      try {
        const response = await fetch(`/api/stock/documents?${queryString}`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || 'Failed to load documents');
        }
        if (mounted) {
          setDocuments(json.documents || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDocuments();

    return () => {
      mounted = false;
    };
  }, [queryString]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.file || !form.entityId) {
      setError('File and Entity ID are required');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', form.file);
      formData.append('documentType', form.documentType);
      formData.append('entityType', form.entityType);
      formData.append('entityId', form.entityId);
      formData.append('documentNumber', form.documentNumber);
      formData.append('notes', form.notes);

      const response = await fetch('/api/stock/documents', {
        method: 'POST',
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to upload document');
      }

      setForm({
        documentType: 'purchase_invoice',
        entityType: 'inbound_shipment',
        entityId: '',
        documentNumber: '',
        notes: '',
        file: null,
      });
      await (async () => {
        const refreshResponse = await fetch(`/api/stock/documents?${queryString}`, { cache: 'no-store' });
        const refreshJson = await refreshResponse.json();
        if (!refreshResponse.ok) {
          throw new Error(refreshJson.error || 'Failed to refresh documents');
        }
        setDocuments(refreshJson.documents || []);
      })();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function openDocumentPreview(document) {
    setPreviewState({
      open: true,
      title: `${document.document_type || 'Document'} ${document.document_number || document.file_name || ''}`.trim(),
      description: 'Document preview and archive details',
      record: document,
    });
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  const documentPagination = paginateRows(documents, documentPage, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setDocumentPage((current) => Math.min(current, documentPagination.pageCount));
  }, [documentPagination.pageCount]);

  function renderDocumentPreview(document) {
    if (!document?.file_url) {
      return (
        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          No preview available.
        </div>
      );
    }

    if (document.mime_type?.startsWith('image/')) {
      return (
        <img
          src={document.file_url}
          alt={document.file_name || 'Document preview'}
          className="max-h-[70vh] w-full rounded-2xl border border-border object-contain bg-background/60"
        />
      );
    }

    return (
      <iframe
        src={document.file_url}
        title={document.file_name || 'Document preview'}
        className="h-[70vh] w-full rounded-2xl border border-border bg-card"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t.title}</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">{t.subtitle}</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/stock" className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60">{t.backToDashboard}</Link>
          <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t.refresh}</button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">{t.uploadTitle}</h2>
          <label className="block text-sm font-medium text-foreground/80">
            {t.documentType}
            <select className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground" value={form.documentType} onChange={(event) => setForm((prev) => ({ ...prev, documentType: event.target.value }))}>
              {documentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.entityType}
            <select className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground" value={form.entityType} onChange={(event) => setForm((prev) => ({ ...prev, entityType: event.target.value }))}>
              {entityTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.entityId}
            <input className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground" value={form.entityId} onChange={(event) => setForm((prev) => ({ ...prev, entityId: event.target.value }))} />
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.documentNumber}
            <input className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground" value={form.documentNumber} onChange={(event) => setForm((prev) => ({ ...prev, documentNumber: event.target.value }))} />
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.notes}
            <textarea className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground" rows="3" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.file}
            <input type="file" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground" onChange={(event) => setForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))} />
          </label>
          <button type="submit" disabled={uploading} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {uploading ? t.upload : t.upload}
          </button>
        </form>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t.recentDocuments}</h2>
            <div className="text-xs text-muted-foreground">{documents.length}</div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">{t.loading}</div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">{t.empty}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/70 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Entity</th>
                      <th className="px-3 py-2">No.</th>
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {documentPagination.rows.map((document) => (
                      <tr
                        key={document.id}
                        className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                        onClick={() => openDocumentPreview(document)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openDocumentPreview(document);
                          }
                        }}
                        title="Click to preview"
                      >
                        <td className="px-3 py-2">{document.document_type}</td>
                        <td className="px-3 py-2">{document.entity_type} #{document.entity_id}</td>
                        <td className="px-3 py-2">{document.document_number || '—'}</td>
                        <td className="px-3 py-2 text-foreground/80">{document.file_name}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground" title={document.notes || ''}>{document.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                page={documentPagination.page}
                pageCount={documentPagination.pageCount}
                total={documentPagination.total}
                pageSize={DEFAULT_PAGE_SIZE}
                onPageChange={setDocumentPage}
              />
            </>
          )}
        </div>
      </div>

      <EntryPreviewSheet
        open={previewState.open}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
        title={previewState.title}
        description={previewState.description}
        sections={[
          {
            title: 'Document Details',
            children: (
              <PreviewKeyValueGrid
                items={[
                  { label: 'Document Type', value: previewState.record?.document_type },
                  { label: 'Entity Type', value: previewState.record?.entity_type },
                  { label: 'Entity ID', value: previewState.record?.entity_id },
                  { label: 'Document Number', value: previewState.record?.document_number },
                  { label: 'File Name', value: previewState.record?.file_name },
                  { label: 'Mime Type', value: previewState.record?.mime_type },
                  { label: 'File Size', value: previewState.record?.file_size_bytes ? `${previewState.record.file_size_bytes} bytes` : '—' },
                  { label: 'Created At', value: previewState.record?.created_at },
                  { label: 'Notes', value: previewState.record?.notes },
                ]}
              />
            ),
          },
          previewState.record
            ? {
                title: 'File Preview',
                children: renderDocumentPreview(previewState.record),
              }
            : null,
        ]}
      />
    </div>
  );
}
