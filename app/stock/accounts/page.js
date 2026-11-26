'use client';

import { TabTrack } from '../components/tab-track';
import { useCallback, useEffect, useState } from 'react';
import { BarChart3, BookOpen, HandCoins, Notebook, Plus, Receipt, Settings2 } from 'lucide-react';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { getRoleFlags } from '@/lib/stock-roles.mjs';
import { CLASSES, ERROR_BOX_CLASS, PILL_PRIMARY_BUTTON_CLASS, tabButtonClass, KBD_ON_PRIMARY_CLASS } from '../lib/stock-utils';
import { PageHeader } from '../components/page-header';
import { SelectField } from '@/components/ui/select';
import { StockToast } from '../components/stock-toast';
import { useAccountsText, VoucherSheet } from '../components/voucher-form';
import { DayBookPanel, GstReturnsPanel, LedgersPanel, OutstandingPanel, ReportsPanel, SetupPanel } from '../components/accounts-panels';

/**
 * Books per business. Approvers run everything; read_only_admin reads.
 */
export default function AccountsPage() {
  const t = useAccountsText();
  const { user } = useAuthUser();
  const { accessRole, accessUser } = useStockAccess(user);
  const isApprover = getRoleFlags(accessRole).canApprove;

  const [businesses, setBusinesses] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [ledgers, setLedgers] = useState([]);
  const [tab, setTab] = useState('daybook');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    fetch('/api/stock/businesses', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load businesses');
        const active = json.businesses.filter((b) => b.isActive);
        setBusinesses(active);
        setBusinessId((id) => id ?? active[0]?.id ?? null);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Ledgers for the voucher form; the panels load their own views.
  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/stock/accounts/ledgers?businessId=${businessId}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load ledgers');
        setLedgers(json.ledgers);
      })
      .catch((err) => setError(err.message));
  }, [businessId, refreshKey]);

  const business = businesses?.find((b) => b.id === businessId);
  const view = business ? { id: business.id, legal_name: business.legalName } : null;
  const tabs = ['daybook', 'outstanding', 'ledgers', 'reports', 'gst', 'setup'];
  const tabIcons = { daybook: BookOpen, outstanding: HandCoins, ledgers: Notebook, reports: BarChart3, gst: Receipt, setup: Settings2 };
  const panelProps = { business: view, isApprover, refreshKey, onChanged: refresh, notify: setToast, t };

  return (
    <div className={CLASSES.contentWrap}>
      <PageHeader
        icon={BookOpen}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={(
          <>
            {businesses?.length > 1 ? (
              <SelectField aria-label={t('business')} value={businessId ?? ''} onChange={(e) => setBusinessId(Number(e.target.value))} className="w-auto min-w-[12rem]">
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.legalName}</option>)}
              </SelectField>
            ) : null}
            {isApprover && view ? (
              <button type="button" onClick={() => setSheetOpen(true)} className={PILL_PRIMARY_BUTTON_CLASS} aria-keyshortcuts="N">
                <Plus /> {t('newVoucher')} <kbd aria-hidden="true" className={KBD_ON_PRIMARY_CLASS}>N</kbd>
              </button>
            ) : null}
          </>
        )}
      />

      {error ? <p role="alert" className={ERROR_BOX_CLASS}>{error}</p> : null}

      {tabs.length > 1 ? (
        <TabTrack role="tablist">
          {tabs.map((key) => { const Icon = tabIcons[key]; return (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={tabButtonClass(tab === key, tabs.length)}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{t(key)}</span>
            </button>
          ); })}
        </TabTrack>
      ) : null}

      {view ? (
        <>
          {tab === 'daybook' ? <DayBookPanel {...panelProps} role={accessRole} me={accessUser?.id} /> : null}
          {tab === 'outstanding' ? <OutstandingPanel {...panelProps} /> : null}
          {tab === 'ledgers' ? <LedgersPanel {...panelProps} /> : null}
          {tab === 'reports' ? <ReportsPanel {...panelProps} /> : null}
          {tab === 'gst' ? <GstReturnsPanel {...panelProps} /> : null}
          {tab === 'setup' ? <SetupPanel {...panelProps} /> : null}
          <VoucherSheet open={sheetOpen} onOpenChange={setSheetOpen} business={view} ledgers={ledgers}
            onSaved={(message) => { setToast({ type: 'success', message }); refresh(); }} t={t} />
        </>
      ) : !error ? <p className="text-sm text-slate-400">{t('loading')}</p> : null}

      <StockToast toast={toast} />
    </div>
  );
}
