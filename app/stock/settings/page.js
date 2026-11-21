'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Settings } from 'lucide-react';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { getRoleFlags } from '@/lib/stock-roles.mjs';
import { CLASSES, tabButtonClass, tabTrackClass } from '../lib/stock-utils';
import { CompanyPanel } from '../components/company-panel';
import { PageHeader } from '../components/page-header';
import { BranchesPanel } from '../components/branches-panel';
import { ItemTypesPanel } from '../components/item-types-panel';

const TABS = [
  { key: 'company', label: 'Company' },
  { key: 'gst', label: 'GST & branches' },
  { key: 'units', label: 'Item units' },
  { key: 'more', label: 'Users & attendance' },
];

/**
 * One place for a company's own setup, as in other business software.
 * Each tab is the panel that already existed elsewhere; the panels check
 * permissions with their own APIs.
 */
export default function SettingsPage() {
  const { user } = useAuthUser();
  const { accessRole } = useStockAccess(user);
  const [tab, setTab] = useState('company');

  if (!getRoleFlags(accessRole).canApprove) {
    return (
      <div className={CLASSES.contentWrap}>
        <p className="text-sm text-muted-foreground">Settings are for your company&apos;s admins and managers.</p>
      </div>
    );
  }

  return (
    <div className={CLASSES.contentWrap}>
      <PageHeader icon={Settings} title="Settings" subtitle="Your company's name, logo and colour, GST registrations, branches and units." />

      <div className={tabTrackClass(TABS.length)} role="tablist">
        {TABS.map(({ key, label }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={tabButtonClass(tab === key, TABS.length)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'company' ? <CompanyPanel /> : null}
      {tab === 'gst' ? <BranchesPanel /> : null}
      {tab === 'units' ? <ItemTypesPanel /> : null}
      {tab === 'more' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { href: '/stock/admin', title: 'Users & roles', text: 'Add staff by email, set their role, divisions and home branch.' },
            { href: '/stock/attendance?view=settings', title: 'Attendance rules', text: 'Shift timings, weekly off, holidays, selfies and kiosks.' },
          ].map(({ href, title, text }) => (
            <Link key={href} href={href} className={`${CLASSES.card} group block transition-colors hover:border-brand-primary/40`}>
              <h2 className={`${CLASSES.title} flex items-center justify-between`}>
                {title} <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </h2>
              <p className="mt-1 text-sm text-slate-500">{text}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
