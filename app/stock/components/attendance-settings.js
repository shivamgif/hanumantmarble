'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Crosshair, KeyRound, MapPin, Plus, Trash2 } from 'lucide-react';
import { CLASSES, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';

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

/**
 * One location's geofence anchor. The "use my location" button is the point of
 * this row: a manager standing in the showroom with the tablet gets the exact
 * coordinates without looking anything up on a map.
 */
function GeofenceRow({ location, onSave }) {
  const [lat, setLat] = useState(location.latitude ?? '');
  const [lng, setLng] = useState(location.longitude ?? '');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  const configured = location.latitude !== null && location.longitude !== null;
  const dirty = String(lat) !== String(location.latitude ?? '') || String(lng) !== String(location.longitude ?? '');

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('This browser cannot report a location.');
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // 6 dp is ~0.1 m, and matches the NUMERIC(9,6) column.
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow it, or type the coordinates.'
            : 'Could not get a location fix. Try outdoors, or type the coordinates.'
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[8rem] flex-1">
          <p className="text-xs font-black">
            {location.name}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {configured ? 'Fenced' : 'No fence'}
            </span>
          </p>
        </div>

        <div className="w-32">
          <label className={FORM_LABEL_CLASS} htmlFor={`lat-${location.id}`}>Latitude</label>
          <input
            id={`lat-${location.id}`}
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className={FORM_INPUT_CLASS}
            placeholder="26.846700"
          />
        </div>
        <div className="w-32">
          <label className={FORM_LABEL_CLASS} htmlFor={`lng-${location.id}`}>Longitude</label>
          <input
            id={`lng-${location.id}`}
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className={FORM_INPUT_CLASS}
            placeholder="80.946700"
          />
        </div>

        <button type="button" onClick={useMyLocation} disabled={locating} className={PILL_BUTTON_CLASS}>
          <Crosshair className="h-3.5 w-3.5" />
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        <button
          type="button"
          onClick={() => onSave(lat === '' ? null : lat, lng === '' ? null : lng)}
          disabled={!dirty}
          className={PILL_PRIMARY_BUTTON_CLASS}
        >
          <MapPin className="h-3.5 w-3.5" />
          Save
        </button>
        {configured ? (
          <button
            type="button"
            onClick={() => {
              setLat('');
              setLng('');
              onSave(null, null);
            }}
            className="text-slate-400 transition hover:text-rose-500"
            aria-label={`Clear geofence for ${location.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {geoError ? <p className="mt-2 text-[11px] font-bold text-amber-600">{geoError}</p> : null}
    </div>
  );
}

export function AttendanceSettings({ employees = [], onEmployeesChanged }) {
  const [settings, setSettings] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [devices, setDevices] = useState([]);
  const [status, setStatus] = useState('');
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

  async function post(url, options, onDone) {
    setError('');
    setStatus('');
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
      setError(err.message);
      return null;
    }
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
          post('/api/stock/attendance/settings', { method: 'PUT', body: JSON.stringify(settings) }, () =>
            setStatus('Work rules saved')
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
          {status ? <span className="text-xs font-bold text-emerald-600">{status}</span> : null}
          <button type="submit" className={PILL_PRIMARY_BUTTON_CLASS}>Save rules</button>
        </div>
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
              setStatus('PIN set');
              setPinForm({ userId: '', pin: '' });
              onEmployeesChanged?.();
            }
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
            post('/api/stock/attendance/holidays', { method: 'POST', body: JSON.stringify(holidayForm) }, () => {
              setHolidayForm({ date: '', name: '' });
              load();
            });
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
                  post(`/api/stock/attendance/holidays?id=${holiday.id}`, { method: 'DELETE' }, load)
                }
                className="text-slate-400 hover:text-rose-500"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          {!holidays.length ? <p className="text-xs font-bold text-slate-400">No holidays configured.</p> : null}
        </div>
      </div>

      {/* Geofence anchors */}
      <div className={CLASSES.card}>
        <h2 className={CLASSES.title}>Geofence</h2>
        <p className="mt-1 text-[11px] font-bold text-slate-500">
          A punch more than {settings.geofence_radius_m} m from these coordinates is flagged for review. It is never
          blocked — GPS fails indoors, and a location a phone never reported counts as unknown, not absent. A location
          with no coordinates has no fence at all.
        </p>

        <div className="mt-4 space-y-2">
          {locations.map((loc) => (
            <GeofenceRow
              key={loc.id}
              location={loc}
              onSave={(latitude, longitude) =>
                post(
                  '/api/stock/attendance/locations',
                  { method: 'PATCH', body: JSON.stringify({ locationId: loc.id, latitude, longitude }) },
                  () => {
                    setStatus(`Geofence saved for ${loc.name}`);
                    load();
                  }
                )
              }
            />
          ))}
          {!locations.length ? <p className="text-xs font-bold text-slate-400">No locations configured.</p> : null}
        </div>
      </div>

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
            post('/api/stock/attendance/devices', { method: 'POST', body: JSON.stringify(deviceForm) }, (json) => {
              setNewToken(json.pairingPath);
              setDeviceForm({ label: '', locationId: '' });
              load();
            });
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
                onClick={() => post(`/api/stock/attendance/devices?id=${device.id}`, { method: 'DELETE' }, load)}
                className="text-slate-400 hover:text-rose-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!devices.length ? <p className="text-xs font-bold text-slate-400">No kiosk devices paired.</p> : null}
        </div>
      </div>

      {error ? <p className="text-xs font-bold text-rose-500">{error}</p> : null}
    </div>
  );
}
