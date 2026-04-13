'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { useEffect, useState } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import PaginationControls from '@/components/ui/pagination-controls';
import { validateStockPassword } from '@/lib/auth0-management';

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function AdminDashboard() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.admin.${key}`, language);
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [arrivalPage, setArrivalPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [previewItemsPage, setPreviewItemsPage] = useState(1);
  const [previewState, setPreviewState] = useState({
    open: false,
    loading: false,
    kind: null,
    title: '',
    description: '',
    record: null,
    items: [],
    documents: [],
    error: null,
  });
  const [userDraft, setUserDraft] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'stock_maintainer',
    status: 'active',
  });

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const response = await fetch('/api/stock/admin/dashboard');
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Fetch failed');
        if (mounted) setData(json);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (user) loadData();
    return () => { mounted = false; };
  }, [user]);

  async function handleShipmentAction(type, id, action, notes = null) {
    const confirmMessage = action === 'reject'
      ? 'Are you sure you want to reject this shipment?'
      : null;

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setActionLoading(`${type}-${id}-${action}`);
    try {
      const response = await fetch(`/api/stock/${type}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes,
          reason: action === 'request_changes' ? notes : undefined,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to update shipment');
      }

      await (async () => {
        const refreshResponse = await fetch('/api/stock/admin/dashboard');
        const refreshJson = await refreshResponse.json();
        if (!refreshResponse.ok) {
          throw new Error(refreshJson.error || 'Failed to refresh dashboard');
        }
        setData(refreshJson);
      })();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function refreshDashboard() {
    const refreshResponse = await fetch('/api/stock/admin/dashboard');
    const refreshJson = await refreshResponse.json();
    if (!refreshResponse.ok) {
      throw new Error(refreshJson.error || 'Failed to refresh dashboard');
    }
    setData(refreshJson);
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  async function openShipmentPreview(kind, row) {
    const shipmentType = kind === 'arrival' ? 'inbound_shipment' : 'outbound_shipment';
    const endpoint = kind === 'arrival'
      ? `/api/stock/inbound-shipments/${row.id}`
      : `/api/stock/outbound-shipments/${row.id}`;

    setPreviewState({
      open: true,
      loading: true,
      kind,
      title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
      description: 'Loading approval detail…',
      record: row,
      items: [],
      documents: [],
      error: null,
    });

    try {
      const [shipmentResponse, documentsResponse] = await Promise.all([
        fetch(endpoint),
        fetch(`/api/stock/documents?entityType=${shipmentType}&entityId=${row.id}&limit=20`, { cache: 'no-store' }),
      ]);

      const shipmentJson = await shipmentResponse.json();
      const documentsJson = await documentsResponse.json();

      if (!shipmentResponse.ok) throw new Error(shipmentJson.error || shipmentJson.detail || 'Failed to load shipment details');
      if (!documentsResponse.ok) throw new Error(documentsJson.error || documentsJson.detail || 'Failed to load shipment documents');

      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${shipmentJson.shipment?.shipment_number || row.shipment_number}`,
        description: kind === 'arrival' ? 'Inbound shipment detail preview' : 'Outbound shipment detail preview',
        record: shipmentJson.shipment || row,
        items: shipmentJson.items || [],
        documents: documentsJson.documents || [],
        error: null,
      });
    } catch (error) {
      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
        description: 'Unable to load full shipment details',
        record: row,
        items: [],
        documents: [],
        error: error.message,
      });
    }
  }

  function openUserPreview(row) {
    setPreviewState({
      open: true,
      loading: false,
      kind: 'user',
      title: row.full_name || row.email || 'User',
      description: 'User contact and access details',
      record: row,
      items: [],
      documents: [],
      error: null,
    });
  }

  async function handleSaveUser(event) {
    event.preventDefault();

    if (!userDraft.name.trim() || !userDraft.phone.trim()) {
      setError('Name and phone are required');
      return;
    }

    if (!userDraft.email.trim()) {
      setError('Email is required');
      return;
    }

    const passwordError = validateStockPassword(userDraft.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setActionLoading('user-save');
    setError(null);

    try {
      const response = await fetch('/api/stock/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userDraft),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save user');
      }

      setUserDraft({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', status: 'active' });
      setShowUserForm(false);
      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteUser(id) {
    if (!window.confirm('Deactivate this user?')) {
      return;
    }

    setActionLoading(`user-${id}-delete`);
    setError(null);

    try {
      const response = await fetch(`/api/stock/users?id=${id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to remove user');
      }

      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const arrivalPagination = paginateRows(data?.pendingArrivals || [], arrivalPage, DEFAULT_PAGE_SIZE);
  const dispatchPagination = paginateRows(data?.pendingDispatches || [], dispatchPage, DEFAULT_PAGE_SIZE);
  const userPagination = paginateRows(data?.users || [], userPage, DEFAULT_PAGE_SIZE);
  const previewItemPagination = paginateRows(previewState.items || [], previewItemsPage, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setArrivalPage((current) => Math.min(current, arrivalPagination.pageCount));
  }, [arrivalPagination.pageCount]);

  useEffect(() => {
    setDispatchPage((current) => Math.min(current, dispatchPagination.pageCount));
  }, [dispatchPagination.pageCount]);

  useEffect(() => {
    setUserPage((current) => Math.min(current, userPagination.pageCount));
  }, [userPagination.pageCount]);

  useEffect(() => {
    setPreviewItemsPage((current) => Math.min(current, previewItemPagination.pageCount));
  }, [previewItemPagination.pageCount]);

  if (loading) return <div className="p-8 text-center">{t('loading')}</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('adminTitle')}</h1>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">{t('pendingArrivals')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="border-b border-border bg-muted/70 font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('shipmentNo')}</th>
                <th className="px-3 py-2">Maintainer</th>
                <th className="px-3 py-2">{t('truck')}</th>
                <th className="px-3 py-2">{t('driver')}</th>
                <th className="px-3 py-2">{t('boxesQty')}</th>
                <th className="px-3 py-2">{t('brokenQty')}</th>
                <th className="px-3 py-2 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {arrivalPagination.rows.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                  onClick={() => openShipmentPreview('arrival', item)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openShipmentPreview('arrival', item);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="px-3 py-2 font-medium text-primary">{item.shipment_number}</td>
                  <td className="px-3 py-2 text-foreground/80">{item.maintainer_name || '-'}</td>
                  <td className="px-3 py-2">{item.truck_license_plate}</td>
                  <td className="px-3 py-2">{item.driver_name}</td>
                  <td className="px-3 py-2">{item.total_whole_qty}</td>
                  <td className="px-3 py-2">{item.total_broken_qty}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleShipmentAction('inbound-shipments', item.id, 'approve');
                      }}
                      disabled={actionLoading === `inbound-shipments-${item.id}-approve`}
                      className="text-green-600 hover:text-green-800 px-2 py-1 bg-green-50 rounded mr-2 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Approve"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleShipmentAction('inbound-shipments', item.id, 'reject', 'Rejected from admin hub');
                      }}
                      disabled={actionLoading === `inbound-shipments-${item.id}-reject`}
                      className="text-red-600 hover:text-red-800 px-2 py-1 bg-red-50 rounded disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Reject"
                    >
                      ✗
                    </button>
                  </td>
                </tr>
              ))}
              {arrivalPagination.total === 0 && (
                <tr><td colSpan="8" className="px-3 py-4 text-center text-muted-foreground">{t('noPending')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={arrivalPagination.page}
          pageCount={arrivalPagination.pageCount}
          total={arrivalPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setArrivalPage}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">{t('pendingDispatches')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="border-b border-border bg-muted/70 font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('dispatchNo')}</th>
                <th className="px-3 py-2">{t('truck')}</th>
                <th className="px-3 py-2">{t('driver')}</th>
                <th className="px-3 py-2">{t('boxesQty')}</th>
                <th className="px-3 py-2">{t('brokenQty')}</th>
                <th className="px-3 py-2 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dispatchPagination.rows.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                  onClick={() => openShipmentPreview('dispatch', item)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openShipmentPreview('dispatch', item);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="px-3 py-2 font-medium text-primary">{item.shipment_number}</td>
                  <td className="px-3 py-2">{item.truck_license_plate}</td>
                  <td className="px-3 py-2">{item.driver_name}</td>
                  <td className="px-3 py-2">{item.total_whole_qty}</td>
                  <td className="px-3 py-2">{item.total_broken_qty}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleShipmentAction('outbound-shipments', item.id, 'approve');
                      }}
                      disabled={actionLoading === `outbound-shipments-${item.id}-approve`}
                      className="text-green-600 hover:text-green-800 px-2 py-1 bg-green-50 rounded mr-2 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Approve"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleShipmentAction('outbound-shipments', item.id, 'reject', 'Rejected from admin hub');
                      }}
                      disabled={actionLoading === `outbound-shipments-${item.id}-reject`}
                      className="text-red-600 hover:text-red-800 px-2 py-1 bg-red-50 rounded disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Reject"
                    >
                      ✗
                    </button>
                  </td>
                </tr>
              ))}
              {dispatchPagination.total === 0 && (
                <tr><td colSpan="7" className="px-3 py-4 text-center text-muted-foreground">{t('noPending')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={dispatchPagination.page}
          pageCount={dispatchPagination.pageCount}
          total={dispatchPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setDispatchPage}
        />
      </div>

      <div id="users-contacts" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">{t('usersSalespersons')}</h2>
          <button
            type="button"
            onClick={() => setShowUserForm((current) => !current)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            {t('addUserContact')}
          </button>
        </div>
        {showUserForm && (
          <form onSubmit={handleSaveUser} className="grid gap-3 border-b border-border bg-muted/30 p-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground/80">{t('name')}</span>
              <input
                value={userDraft.name}
                onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground/80">{t('phone')}</span>
              <input
                value={userDraft.phone}
                onChange={(event) => setUserDraft((current) => ({ ...current, phone: event.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground/80">{t('email')}</span>
              <input
                type="email"
                value={userDraft.email}
                onChange={(event) => setUserDraft((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground/80">Password</span>
              <input
                type="password"
                value={userDraft.password}
                onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                placeholder="12+ chars, 3 of 4 types"
                minLength={12}
              />
              <p className="mt-1 text-xs text-muted-foreground">Use at least 12 characters and include 3 of 4 types: lowercase, uppercase, number, and symbol.</p>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground/80">{t('role')}</span>
              <select
                value={userDraft.role}
                onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="stock_maintainer">stock_maintainer</option>
                <option value="manager">manager</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <div className="flex items-center gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={actionLoading === 'user-save'}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowUserForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="border-b border-border bg-muted/70 font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('name')}</th>
                <th className="px-3 py-2">{t('email')}</th>
                <th className="px-3 py-2">{t('phone')}</th>
                <th className="px-3 py-2">{t('role')}</th>
                <th className="px-3 py-2">{t('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {userPagination.rows.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                  onClick={() => openUserPreview(u)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openUserPreview(u);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="px-3 py-2 font-medium text-foreground">{u.full_name || 'N/A'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-2">{u.phone_number || 'N/A'}</td>
                  <td className="px-3 py-2"><span className="rounded bg-muted px-2 py-0.5 text-xs text-foreground/80">{u.role}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {u.is_active ? <span className="text-green-600 text-xs font-semibold">{t('active')}</span> : <span className="text-red-600 text-xs font-semibold">{t('inactive')}</span>}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteUser(u.id);
                        }}
                        disabled={actionLoading === `user-${u.id}-delete`}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={userPagination.page}
          pageCount={userPagination.pageCount}
          total={userPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setUserPage}
        />
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
        summary={
          previewState.loading ? (
            <div className="text-sm text-slate-500">Loading preview…</div>
          ) : previewState.error ? (
            <div className="text-sm text-red-600">{previewState.error}</div>
          ) : null
        }
        sections={
          previewState.kind === 'user'
            ? [
                {
                  title: 'User Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Full Name', value: previewState.record?.full_name },
                        { label: 'Email', value: previewState.record?.email },
                        { label: 'Phone', value: previewState.record?.phone_number },
                        { label: 'Role', value: previewState.record?.role },
                        { label: 'Active', value: previewState.record?.is_active ? 'Yes' : 'No' },
                        { label: 'Auth0 Sub', value: previewState.record?.auth0_sub },
                        { label: 'Last Login', value: previewState.record?.last_login_at },
                      ]}
                    />
                  ),
                },
              ]
            : [
                {
                  title: 'Shipment Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Shipment No.', value: previewState.record?.shipment_number },
                        { label: 'Datetime', value: formatDateTime(previewState.record?.arrival_date || previewState.record?.dispatch_date || previewState.record?.created_at) },
                        { label: 'Truck', value: previewState.record?.truck_license_plate },
                        { label: 'Driver', value: previewState.record?.driver_name },
                        { label: 'Status', value: previewState.record?.status },
                        { label: 'Approval', value: previewState.record?.approval_status },
                        { label: 'Whole Qty', value: previewState.record?.total_whole_qty },
                        { label: 'Broken Qty', value: previewState.record?.total_broken_qty },
                      ]}
                    />
                  ),
                },
                previewState.items?.length
                  ? {
                      title: 'Line Items',
                      children: (
                        <>
                          <div className="overflow-hidden rounded-2xl border border-border bg-card">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-muted/70 text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">SKU</th>
                                  <th className="px-3 py-2">Name</th>
                                  <th className="px-3 py-2 text-right">Whole</th>
                                  <th className="px-3 py-2 text-right">Broken</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border bg-card">
                                {previewItemPagination.rows.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2 font-medium text-foreground">{item.sku}</td>
                                    <td className="px-3 py-2 text-foreground/80">{item.item_name}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_whole_qty ?? item.received_whole_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_broken_qty ?? item.received_broken_qty ?? 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <PaginationControls
                            page={previewItemPagination.page}
                            pageCount={previewItemPagination.pageCount}
                            total={previewItemPagination.total}
                            pageSize={DEFAULT_PAGE_SIZE}
                            onPageChange={setPreviewItemsPage}
                          />
                        </>
                      ),
                    }
                  : null,
                previewState.documents?.length
                  ? {
                      title: 'Linked Documents',
                      children: (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {previewState.documents.map((document) => (
                            <a
                              key={document.id}
                              href={document.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-2xl border border-border bg-muted/30 p-3 transition hover:border-primary/30 hover:bg-primary/5"
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{document.document_type}</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{document.document_number || document.file_name}</div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">{document.file_name}</div>
                            </a>
                          ))}
                        </div>
                      ),
                    }
                  : null,
              ]
        }
      />
    </div>
  );
}
