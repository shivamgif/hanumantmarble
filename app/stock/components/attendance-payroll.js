'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, BookOpen, Download, Settings2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuthUser } from '@/lib/auth-client';
import { useStockAccess } from '@/hooks/useStockAccess';
import { getRoleFlags } from '@/lib/stock-roles.mjs';
import { MonthPicker } from '@/components/ui/month-picker';
import { formatMinutes, istMonth } from '@/lib/attendance.mjs';
import { CLASSES, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS, exportToCSV } from '../lib/stock-utils';

const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const CSV_COLUMNS = [
  { id: 'name', label: 'Employee' },
  { id: 'department', label: 'Department' },
  { id: 'salary', label: 'Monthly Salary' },
  { id: 'workingDays', label: 'Working Days' },
  { id: 'presentDays', label: 'Present' },
  { id: 'halfDays', label: 'Half Days' },
  { id: 'paidLeaveDays', label: 'Paid Leave' },
  { id: 'unpaidLeaveDays', label: 'Unpaid Leave' },
  { id: 'absentDays', label: 'Absent' },
  { id: 'lateDays', label: 'Late Days' },
  { id: 'overtimeHours', label: 'Overtime Hours', value: (r) => (r.overtimeMinutes / 60).toFixed(2) },
  { id: 'perDay', label: 'Per Day' },
  { id: 'earnedBase', label: 'Earned' },
  { id: 'overtimePay', label: 'Overtime Pay' },
  { id: 'deductions', label: 'Deductions' },
  { id: 'netPay', label: 'Gross Pay' },
  { id: 'pf', label: 'PF (employee)', value: (r) => r.statutory.pfEmployee },
  { id: 'esi', label: 'ESI (employee)', value: (r) => r.statutory.esiEmployee },
  { id: 'tds', label: 'TDS', value: (r) => r.statutory.tds },
  { id: 'netPayable', label: 'Net Payable', value: (r) => r.statutory.netPayable },
  { id: 'employerCost', label: 'Employer PF+ESI', value: (r) => r.statutory.employerCost },
];

// EPFO ECR columns (the portal's text format is these, '#~#'-separated; the CA
// or the uploader converts) and ESIC's monthly contribution columns.
const ECR_COLUMNS = [
  { id: 'uan', label: 'UAN' },
  { id: 'name', label: 'Member Name' },
  { id: 'gross', label: 'Gross Wages', value: (r) => r.statutory.gross },
  { id: 'epfWages', label: 'EPF Wages', value: (r) => r.statutory.pfWages },
  { id: 'epsWages', label: 'EPS Wages', value: (r) => r.statutory.pfWages },
  { id: 'edliWages', label: 'EDLI Wages', value: (r) => r.statutory.pfWages },
  { id: 'ee', label: 'EPF Contribution (EE)', value: (r) => r.statutory.pfEmployee },
  { id: 'eps', label: 'EPS Contribution', value: (r) => r.statutory.eps },
  { id: 'er', label: 'EPF-EPS Difference (ER)', value: (r) => r.statutory.pfEmployerEpf },
  { id: 'ncp', label: 'NCP Days', value: (r) => Math.max(0, Math.round((r.workingDays ?? 0) - r.paidDays)) },
  { id: 'refund', label: 'Refund of Advances', value: () => 0 },
];
const ESI_COLUMNS = [
  { id: 'esiIpNumber', label: 'IP Number' },
  { id: 'name', label: 'IP Name' },
  { id: 'days', label: 'No of Days', value: (r) => Math.round(r.paidDays) },
  { id: 'wages', label: 'Total Monthly Wages', value: (r) => r.statutory.esiWages },
  { id: 'ee', label: 'Employee Contribution', value: (r) => r.statutory.esiEmployee },
  { id: 'er', label: 'Employer Contribution', value: (r) => r.statutory.esiEmployer },
];

async function readJson(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || json.detail || 'Request failed');
  return json;
}

/** One person's PF/ESI/TDS details. */
function StatutorySheet({ row, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, error: '' });
  useEffect(() => {
    if (row) setForm({ pfApplicable: row.pfApplicable, esiApplicable: row.esiApplicable, uan: row.uan || '', esiIpNumber: row.esiIpNumber || '', tdsMonthly: String(row.tdsMonthly || '') });
  }, [row]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  return (
    <Sheet open={Boolean(row)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto bg-white dark:bg-slate-950">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="text-base">{row?.name}: PF, ESI &amp; TDS</SheetTitle>
          <SheetDescription className="text-xs">PF is 12% of wages up to ₹15,000; ESI applies while the monthly salary is ₹21,000 or less. Off by default.</SheetDescription>
        </SheetHeader>
        {form ? (
          <form className="mt-4 space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            setState({ busy: true, error: '' });
            try {
              await readJson(await fetch('/api/stock/attendance/payroll', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: row.userId, ...form }),
              }));
              onSaved();
            } catch (err) {
              setState({ busy: false, error: err.message });
            }
          }}>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pfApplicable} onChange={(e) => set({ pfApplicable: e.target.checked })} /> PF applies</label>
            <label className="block"><span className={FORM_LABEL_CLASS}>UAN (12 digits)</span>
              <input value={form.uan} inputMode="numeric" maxLength={12} onChange={(e) => set({ uan: e.target.value })} className={FORM_INPUT_CLASS} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.esiApplicable} onChange={(e) => set({ esiApplicable: e.target.checked })} /> ESI applies</label>
            <label className="block"><span className={FORM_LABEL_CLASS}>ESI IP number (10 digits)</span>
              <input value={form.esiIpNumber} inputMode="numeric" maxLength={10} onChange={(e) => set({ esiIpNumber: e.target.value })} className={FORM_INPUT_CLASS} /></label>
            <label className="block"><span className={FORM_LABEL_CLASS}>Salary TDS per month (section 192, ₹)</span>
              <input type="number" min="0" step="1" value={form.tdsMonthly} onChange={(e) => set({ tdsMonthly: e.target.value })} className={FORM_INPUT_CLASS} /></label>
            {state.error ? <p className="text-sm text-rose-500">{state.error}</p> : null}
            <button type="submit" disabled={state.busy} className={PILL_PRIMARY_BUTTON_CLASS}>Save</button>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function AttendancePayroll() {
  const [month, setMonth] = useState(istMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [notice, setNotice] = useState('');
  const { user } = useAuthUser();
  const { accessRole } = useStockAccess(user);
  const isApprover = getRoleFlags(accessRole).canApprove;

  useEffect(() => {
    if (!isApprover) return;
    fetch('/api/stock/businesses', { cache: 'no-store' }).then(readJson)
      .then((json) => setBusinesses((json.businesses || []).filter((b) => b.isActive)))
      .catch(() => setBusinesses([]));
  }, [isApprover]);

  async function postToBooks(businessId) {
    setNotice('');
    try {
      const json = await readJson(await fetch('/api/stock/attendance/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, businessId }),
      }));
      setNotice(json.voucher ? `Posted ${json.voucher.voucher_number} for ${json.staff} staff. Posting again replaces it.` : 'Nothing to post for this month.');
    } catch (err) {
      setNotice(err.message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/stock/attendance/payroll?month=${month}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to build payroll');
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, refreshKey]);

  const rows = (data?.rows || []).map((row) => ({ ...row, workingDays: data?.workingDays }));

  return (
    <div className={CLASSES.card}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className={CLASSES.title}>Payroll</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {data ? `${data.workingDays} working days · ${rupees(data.totals?.netPay)} gross · ${rupees(data.totals?.netPayable)} to pay` : '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} max={istMonth()} />
          <button
            type="button"
            onClick={() => exportToCSV(`payroll-${month}.csv`, rows, CSV_COLUMNS)}
            disabled={!rows.length}
            className={PILL_BUTTON_CLASS}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button type="button" onClick={() => exportToCSV(`ecr-${month}.csv`, rows.filter((r) => r.pfApplicable), ECR_COLUMNS)} disabled={!rows.some((r) => r.pfApplicable)} className={PILL_BUTTON_CLASS}>
            <Download className="h-3.5 w-3.5" /> PF ECR
          </button>
          <button type="button" onClick={() => exportToCSV(`esi-${month}.csv`, rows.filter((r) => r.statutory?.esiCovered), ESI_COLUMNS)} disabled={!rows.some((r) => r.statutory?.esiCovered)} className={PILL_BUTTON_CLASS}>
            <Download className="h-3.5 w-3.5" /> ESI
          </button>
          {isApprover && businesses.length ? businesses.map((b) => (
            <button key={b.id} type="button" onClick={() => postToBooks(b.id)} disabled={!rows.length} className={PILL_BUTTON_CLASS} title={`Post this month's payroll to ${b.legalName}'s books`}>
              <BookOpen className="h-3.5 w-3.5" /> Post to books{businesses.length > 1 ? ` (${b.legalName})` : ''}
            </button>
          )) : null}
        </div>
      </div>

      {error ? <p className="mb-2 text-xs font-bold text-rose-500">{error}</p> : null}
      {notice ? <p className="mb-2 rounded-lg bg-slate-500/10 px-4 py-2 text-xs font-bold">{notice}</p> : null}

      {data?.missingSalary?.length ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-muted px-4 py-2 text-[11px] font-bold text-amber-700">
          <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0" />
          <span>No salary set, so these are paid ₹0: {data.missingSalary.join(', ')}</span>
        </p>
      ) : null}

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px]">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border/60">
              {['Employee', 'Present', 'Half', 'Leave', 'Absent', 'OT', 'Per day', 'Earned', 'OT pay', 'Gross', 'PF', 'ESI', 'TDS', 'Net payable'].map((label) => (
                <th
                  key={label}
                  className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                    label === 'Employee' ? 'text-left' : 'text-right'
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {loading ? (
              <tr>
                <td colSpan={14} className="px-4 py-4">
                  <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                  No tracked employees.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.userId} className="transition hover:bg-slate-500/5">
                  <td className="px-4 py-2 text-xs font-bold">
                    {row.name}
                    {!row.hasLogin ? (
                      <span className="ml-2 text-xs font-medium text-slate-500">no login</span>
                    ) : null}
                    {isApprover ? (
                      <button type="button" onClick={() => setEditing(row)} className="ml-2 inline-flex items-center gap-1 rounded-lg px-1 text-[11px] font-medium text-slate-500 hover:text-foreground" aria-label={`PF, ESI and TDS for ${row.name}`}>
                        <Settings2 className="h-3 w-3" /> {[row.pfApplicable && 'PF', row.esiApplicable && 'ESI'].filter(Boolean).join('+') || 'Statutory'}
                      </button>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{row.presentDays}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{row.halfDays || '—'}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{row.paidLeaveDays || '—'}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-rose-500">{row.absentDays || '—'}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">
                    {row.overtimeMinutes ? formatMinutes(row.overtimeMinutes) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{rupees(row.perDay)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{rupees(row.earnedBase)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{row.overtimePay ? rupees(row.overtimePay) : '—'}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{rupees(row.netPay)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{row.statutory.pfEmployee ? rupees(row.statutory.pfEmployee) : '—'}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{row.statutory.esiEmployee ? rupees(row.statutory.esiEmployee) : '—'}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{row.statutory.tds ? rupees(row.statutory.tds) : '—'}</td>
                  <td className="px-4 py-2 text-right text-xs font-bold tabular-nums">{rupees(row.statutory.netPayable)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <article key={row.userId} className="rounded-lg border border-border/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">{row.name}</span>
              <span className="text-xs font-bold tabular-nums">{rupees(row.statutory?.netPayable ?? row.netPay)}</span>
            </div>
            <p className="mt-1 text-[11px] font-bold tabular-nums text-slate-500">
              {row.presentDays} present · {row.absentDays} absent · {formatMinutes(row.overtimeMinutes)} OT
            </p>
          </article>
        ))}
      </div>

      <StatutorySheet row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRefreshKey((k) => k + 1); }} />
    </div>
  );
}
