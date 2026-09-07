'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { CLASSES, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';
import { BranchesPanel } from './branches-panel';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FIELDS = [
  { key: 'shift_start', label: 'Shift start', type: 'time' },
  { key: 'shift_end', label: 'Shift end', type: 'time' },
  { key: 'full_day_minutes', label: 'Full day (minutes)', type: 'number' },
  { key: 'half_day_minutes', label: 'Half day (minutes)', type: 'number' },
  { key: 'grace_minutes', label: 'Late grace (minutes)', type: 'number' },
  { key: 'overtime_multiplier', label: 'Overtime multiplier', type: 'number', step: '0.1' },
  { key: 'geofence_radius_m', label: 'Geofence radius (m)', type: 'number' },
];

export function AttendanceSettings({ employees = [], onEmployeesChanged }) {
  const [settings, setSettings] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [devices, setDevices] = useState([]);
  // Feedback is scoped to the section that produced it. A single page-level
  // message rendered far below meant a rejected PIN reported its reason
  // off-screen, so the form just appeared to do nothing.
  const [feedback, setFeedback] = useState({ scope: '', kind: '', message: '' });
  const [error, setError] = useState('');
  const [newToken, setNewToken] = useState('');
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });
  const [deviceForm, setDeviceForm] = useState({ label: '', locationId: '' });
  const [locations, setLocations] = useState([]);
  const [pinForm, setPinForm] = useState({ userId: '', pin: '' });

  const load = useCallback(() => {
    setError('');
    Promise.all([
      fetch('/api/stock/attendance/settings', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/stock/attendance/devices', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([settingsJson, devicesJson]) => {
        if (settingsJson.error) throw new Error(settingsJson.error);
        setSettings(settingsJson.settings);
        setHolidays(settingsJson.holidays || []);
        if (!devicesJson.error) {
          setDevices(devicesJson.devices || []);
          setLocations(devicesJson.locations || []);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  // `scope` names the section, so the reply lands next to the button that
  // triggered it rather than at the bottom of the page.
  async function post(url, options, onDone, scope = '') {
    setError('');
    setFeedback({ scope: '', kind: '', message: '' });
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      onDone?.(json);
      return json;
    } catch (err) {
      setFeedback({ scope, kind: 'error', message: err.message });
      return null;
    }
  }

  const say = (scope, message) => setFeedback({ scope, kind: 'success', message });

  function Feedback({ scope }) {
    if (feedback.scope !== scope || !feedback.message) return null;
    return (
      <p className={`mt-3 text-xs font-bold ${feedback.kind === 'error' ? 'text-rose-500' : 'text-emerald-600'}`}>
        {feedback.message}
      </p>
    );
  }

  if (!settings) {
    return <p className="py-10 text-center text-xs font-bold text-slate-400">{error || 'Loading…'}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Work rules */}
      <form
        className={CLASSES.card}
        onSubmit={(e) => {
          e.preventDefault();
          post(
            '/api/stock/attendance/settings',
            { method: 'PUT', body: JSON.stringify(settings) },
            () => say('rules', 'Work rules saved'),
            'rules'
          );
        }}
      >
        <h2 className={CLASSES.title}>Work rules</h2>
        <p className="mt-1 text-[11px] font-bold text-slate-500">
          These apply to everyone and drive late marks, overtime and payroll.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label className={FORM_LABEL_CLASS} htmlFor={`setting-${field.key}`}>{field.label}</label>
              <input
                id={`setting-${field.key}`}
                type={field.type}
                step={field.step}
                value={settings[field.key] ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, [field.key]: e.target.value }))}
                className={FORM_INPUT_CLASS}
              />
            </div>
          ))}
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="setting-weekly-off">Weekly off</label>
            <select
              id="setting-weekly-off"
              value={settings.weekly_off_dow}
              onChange={(e) => setSettings((s) => ({ ...s, weekly_off_dow: Number(e.target.value) }))}
              className={FORM_INPUT_CLASS}
            >
              {DAYS.map((day, index) => (
                <option key={day} value={index}>{day}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          <button type="submit" className={PILL_PRIMARY_BUTTON_CLASS}>Save rules</button>
        </div>
        <Feedback scope="rules" />
      </form>

      {/* Kiosk PINs */}
      <form
        className={CLASSES.card}
        onSubmit={(e) => {
          e.preventDefault();
          post(
            '/api/stock/attendance/pin',
            { method: 'PUT', body: JSON.stringify({ userId: pinForm.userId || undefined, pin: pinForm.pin }) },
            () => {
              say('pin', 'PIN set. They can now punch at any paired kiosk.');
              setPinForm({ userId: '', pin: '' });
              onEmployeesChanged?.();
            },
            'pin'
          );
        }}
      >
        <h2 className={CLASSES.title}>Kiosk PIN</h2>
        <p className="mt-1 text-[11px] font-bold text-slate-500">
          Only for punching at a shared tablet — never a login. Setting a PIN is how someone joins the kiosk list.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="pin-employee">Employee</label>
            <select
              id="pin-employee"
              value={pinForm.userId}
              onChange={(e) => setPinForm((f) => ({ ...f, userId: e.target.value }))}
              className={FORM_INPUT_CLASS}
            >
              <option value="">Myself</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}{emp.hasPin ? ' (has PIN)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="pin-value">New PIN</label>
            <input
              id="pin-value"
              type="password"
              inputMode="numeric"
              pattern="\d{4,8}"
              autoComplete="new-password"
              placeholder="4-8 digits"
              title="4 to 8 digits. Avoid repeated digits and simple runs like 1234."
              value={pinForm.pin}
              onChange={(e) => setPinForm((f) => ({ ...f, pin: e.target.value }))}
              className={FORM_INPUT_CLASS}
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className={PILL_PRIMARY_BUTTON_CLASS}>
              <KeyRound className="h-3.5 w-3.5" />
              Set PIN
            </button>
          </div>
        </div>
        <Feedback scope="pin" />
      </form>

      {/* Holidays */}
      <div className={CLASSES.card}>
        <h2 className={CLASSES.title}>Holidays</h2>
        <p className="mt-1 text-[11px] font-bold text-slate-500">
          Holidays reduce the working-day count, which raises everyone&apos;s per-day rate for the month.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            post(
              '/api/stock/attendance/holidays',
              { method: 'POST', body: JSON.stringify(holidayForm) },
              () => {
                setHolidayForm({ date: '', name: '' });
                load();
              },
              'holidays'
            );
          }}
        >
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="holiday-date">Date</label>
            <input
              id="holiday-date"
              type="date"
              required
              value={holidayForm.date}
              onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))}
              className={FORM_INPUT_CLASS}
            />
          </div>
          <div className="flex-1">
            <label className={FORM_LABEL_CLASS} htmlFor="holiday-name">Name</label>
            <input
              id="holiday-name"
              required
              value={holidayForm.name}
              onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))}
              className={FORM_INPUT_CLASS}
              placeholder="Diwali"
            />
          </div>
          <button type="submit" className={PILL_BUTTON_CLASS}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {holidays.map((holiday) => (
            <span
              key={holiday.id}
              className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-[11px] font-bold"
            >
              <span className="tabular-nums text-slate-500">{holiday.holiday_date}</span>
              {holiday.name}
              <button
                type="button"
                aria-label={`Remove ${holiday.name}`}
                onClick={() =>
                  post(`/api/stock/attendance/holidays?id=${holiday.id}`, { method: 'DELETE' }, load, 'holidays')
                }
                className="text-slate-400 hover:text-rose-500"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          {!holidays.length ? <p className="text-xs font-bold text-slate-400">No holidays configured.</p> : null}
        </div>
        <Feedback scope="holidays" />
      </div>

      {/* Staff: home branch + whether they are tracked at all */}
      <div className={CLASSES.card}>
        <h2 className={CLASSES.title}>Staff</h2>
        <p className="mt-1 text-[11px] font-bold text-slate-500">
          A home branch is a fallback, not a restriction — anyone can punch at any branch, and the punch records where
          they actually were. It is used when GPS is unavailable, to put a branch&apos;s own people at the front of its
          kiosk, and to report per branch.
        </p>

        <div className="mt-4 space-y-2">
          {employees.map((emp) => (
            <div key={emp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
              <div className="min-w-[10rem] flex-1">
                <p className="text-xs font-black">
                  {emp.name}
                  {!emp.hasLogin ? (
                    <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">no login</span>
                  ) : null}
                  {emp.hasPin ? (
                    <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-600">pin</span>
                  ) : null}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{emp.role}</p>
              </div>

              <select
                value={emp.defaultLocationId ?? ''}
                aria-label={`Home branch for ${emp.name}`}
                onChange={(e) =>
                  post(
                    '/api/stock/attendance/employees',
                    {
                      method: 'PATCH',
                      body: JSON.stringify({
                        userId: emp.id,
                        defaultLocationId: e.target.value === '' ? null : Number(e.target.value),
                      }),
                    },
                    () => {
                      say('staff', `${emp.name} updated`);
                      onEmployeesChanged?.();
                    },
                    'staff'
                  )
                }
                className={`${FORM_INPUT_CLASS} w-auto`}
              >
                <option value="">No home branch</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <input
                  type="checkbox"
                  checked={emp.tracksAttendance}
                  onChange={(e) =>
                    post(
                      '/api/stock/attendance/employees',
                      {
                        method: 'PATCH',
                        body: JSON.stringify({ userId: emp.id, tracksAttendance: e.target.checked }),
                      },
                      () => {
                        say('staff', `${emp.name} updated`);
                        onEmployeesChanged?.();
                      },
                      'staff'
                    )
                  }
                  className="h-4 w-4 rounded border-border/60"
                />
                Tracked
              </label>
            </div>
          ))}
          {!employees.length ? <p className="text-xs font-bold text-slate-400">No active employees.</p> : null}
        </div>
        <Feedback scope="staff" />
      </div>

      {/* Branches — add a site, set its geofence anchor, retire it. Shared with
          /stock/admin so a manager finds it wherever they look. The radius that
          these anchors are measured against is the global setting above. */}
      <BranchesPanel onChanged={load} />

      {/* Kiosk devices */}
      <div className={CLASSES.card}>
        <h2 className={CLASSES.title}>Kiosk devices</h2>
        <p className="mt-1 text-[11px] font-bold text-slate-500">
          Pair a showroom tablet, then open the pairing link on that tablet once.
        </p>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            post(
              '/api/stock/attendance/devices',
              { method: 'POST', body: JSON.stringify(deviceForm) },
              (json) => {
                setNewToken(json.pairingPath);
                setDeviceForm({ label: '', locationId: '' });
                load();
              },
              'devices'
            );
          }}
        >
          <div className="flex-1">
            <label className={FORM_LABEL_CLASS} htmlFor="device-label">Label</label>
            <input
              id="device-label"
              required
              value={deviceForm.label}
              onChange={(e) => setDeviceForm((f) => ({ ...f, label: e.target.value }))}
              className={FORM_INPUT_CLASS}
              placeholder="Showroom counter tablet"
            />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="device-location">Location</label>
            <select
              id="device-location"
              value={deviceForm.locationId}
              onChange={(e) => setDeviceForm((f) => ({ ...f, locationId: e.target.value }))}
              className={FORM_INPUT_CLASS}
            >
              <option value="">None</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={PILL_BUTTON_CLASS}>
            <Plus className="h-3.5 w-3.5" />
            Pair device
          </button>
        </form>

        {newToken ? (
          <div className="mt-4 rounded-xl bg-amber-500/10 p-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">
              Open this on the tablet now — it is shown only once
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-background px-2 py-1.5 text-[11px]">
                {newToken}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${newToken}`)}
                className={PILL_BUTTON_CLASS}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {devices.map((device) => (
            <div key={device.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3">
              <div>
                <p className="text-xs font-black">{device.label}</p>
                <p className="text-[11px] font-bold text-slate-500">
                  {device.location_name || 'No location'}
                  {device.last_seen_at ? ` · last used ${device.last_seen_at.replace('T', ' ').slice(0, 16)}` : ' · never used'}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Revoke ${device.label}`}
                onClick={() => post(`/api/stock/attendance/devices?id=${device.id}`, { method: 'DELETE' }, load, 'devices')}
                className="text-slate-400 hover:text-rose-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!devices.length ? <p className="text-xs font-bold text-slate-400">No kiosk devices paired.</p> : null}
        </div>
        <Feedback scope="devices" />
      </div>

      {/* Only whole-page load failures land here now; everything a button
          triggers reports next to that button. */}
      {error ? <p className="text-xs font-bold text-rose-500">{error}</p> : null}
    </div>
  );
}
