'use client';

import { useCallback, useEffect, useState } from 'react';
import { Crosshair, MapPin, Plus, RotateCcw } from 'lucide-react';
import { CLASSES, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';

/**
 * Branches — add a site, set its geofence anchor, retire it.
 *
 * Rendered on BOTH /stock/admin and Attendance → Settings, so it owns its own
 * data fetching rather than taking a locations prop: the two hosts have nothing
 * else in common. `onChanged` lets a host refresh anything downstream (the
 * home-branch dropdown on the user form, for instance).
 *
 * A branch and its geofence are the same row, so they are edited together here
 * instead of in two places.
 */

const TYPE_LABELS = {
  warehouse: 'Warehouse',
  showroom: 'Showroom',
  yard: 'Yard',
  in_transit: 'In transit',
  customer_site: 'Customer site',
  supplier_site: 'Supplier site',
  other: 'Other',
};

// The types worth offering for a place people actually work. The API accepts
// the full CHECK list; the transit/customer/supplier values are inventory
// bookkeeping, not branches, so they are not offered here.
const BRANCH_TYPES = ['warehouse', 'showroom', 'yard', 'other'];

/** Ask the browser where it is, at the precision of the NUMERIC(9,6) column. */
function useMyLocation(onFix) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  function locate() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('This browser cannot report a location.');
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // 6 dp is ~0.1 m and matches the column precision exactly.
        onFix(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6));
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

  return { locate, locating, geoError };
}

/**
 * One branch. The "use my location" button is the point of this row: a manager
 * standing in the branch gets its coordinates without looking up a map.
 */
function BranchRow({ branch, onSave, onRetire, onRestore }) {
  const [name, setName] = useState(branch.name);
  const [locationType, setLocationType] = useState(branch.locationType);
  const [lat, setLat] = useState(branch.latitude ?? '');
  const [lng, setLng] = useState(branch.longitude ?? '');
  const { locate, locating, geoError } = useMyLocation((a, b) => {
    setLat(a);
    setLng(b);
  });

  const configured = branch.latitude !== null && branch.longitude !== null;
  const dirty =
    name.trim() !== branch.name ||
    locationType !== branch.locationType ||
    String(lat) !== String(branch.latitude ?? '') ||
    String(lng) !== String(branch.longitude ?? '');

  return (
    <div className={`rounded-xl border p-3 ${branch.isActive ? 'border-border/60' : 'border-border/40 opacity-60'}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className={FORM_LABEL_CLASS} htmlFor={`name-${branch.id}`}>
            Name
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {configured ? 'Fenced' : 'No fence'}
            </span>
            {!branch.isActive ? (
              <span className="ml-2 rounded-full bg-slate-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                Retired
              </span>
            ) : null}
          </label>
          {/* Renaming is safe: everything points at the id, so past movements,
              shipments and attendance follow the new name automatically. */}
          <input
            id={`name-${branch.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FORM_INPUT_CLASS}
          />
        </div>

        <div>
          <label className={FORM_LABEL_CLASS} htmlFor={`type-${branch.id}`}>Type</label>
          <select
            id={`type-${branch.id}`}
            value={locationType}
            onChange={(e) => setLocationType(e.target.value)}
            className={FORM_INPUT_CLASS}
          >
            {BRANCH_TYPES.map((type) => (
              <option key={type} value={type}>{TYPE_LABELS[type]}</option>
            ))}
            {/* A row may already carry a type this form does not offer. */}
            {!BRANCH_TYPES.includes(locationType) ? (
              <option value={locationType}>{TYPE_LABELS[locationType] || locationType}</option>
            ) : null}
          </select>
        </div>

        <div className="w-32">
          <label className={FORM_LABEL_CLASS} htmlFor={`lat-${branch.id}`}>Latitude</label>
          <input
            id={`lat-${branch.id}`}
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className={FORM_INPUT_CLASS}
            placeholder="26.846700"
          />
        </div>
        <div className="w-32">
          <label className={FORM_LABEL_CLASS} htmlFor={`lng-${branch.id}`}>Longitude</label>
          <input
            id={`lng-${branch.id}`}
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className={FORM_INPUT_CLASS}
            placeholder="80.946700"
          />
        </div>

        <button type="button" onClick={locate} disabled={locating} className={PILL_BUTTON_CLASS}>
          <Crosshair className="h-3.5 w-3.5" />
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        <button
          type="button"
          onClick={() =>
            onSave({
              name: name.trim(),
              locationType,
              latitude: lat === '' ? null : lat,
              longitude: lng === '' ? null : lng,
            })
          }
          disabled={!dirty}
          className={PILL_PRIMARY_BUTTON_CLASS}
        >
          <MapPin className="h-3.5 w-3.5" />
          Save
        </button>

        {/* Retire, never delete: shipments, movements and past attendance all
            point at this row. */}
        {branch.isActive ? (
          <button type="button" onClick={onRetire} className={PILL_BUTTON_CLASS}>
            Retire
          </button>
        ) : (
          <button type="button" onClick={onRestore} className={PILL_BUTTON_CLASS}>
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </button>
        )}
      </div>
      {geoError ? <p className="mt-2 text-[11px] font-bold text-amber-600">{geoError}</p> : null}
    </div>
  );
}

export function BranchesPanel({ onChanged }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [feedback, setFeedback] = useState({ kind: '', message: '' });
  const [form, setForm] = useState({ name: '', locationType: 'warehouse', latitude: '', longitude: '' });
  const { locate, locating, geoError } = useMyLocation((a, b) =>
    setForm((f) => ({ ...f, latitude: a, longitude: b }))
  );

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/stock/locations?includeInactive=true', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load branches');
        return json;
      })
      .then((json) => {
        setBranches(json.locations || []);
        setCanManage(Boolean(json.canManage));
      })
      .catch((err) => setFeedback({ kind: 'error', message: err.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function send(options, successMessage) {
    setFeedback({ kind: '', message: '' });
    try {
      const res = await fetch('/api/stock/locations', {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      setFeedback({ kind: 'success', message: successMessage });
      load();
      onChanged?.();
      return json;
    } catch (err) {
      setFeedback({ kind: 'error', message: err.message });
      return null;
    }
  }

  return (
    <div className={CLASSES.card}>
      <h2 className={CLASSES.title}>Branches</h2>
      <p className="mt-1 text-[11px] font-bold text-slate-500">
        Every place people work. Coordinates are the geofence anchor and are also how a phone punch works out which
        branch someone is at — a branch with no coordinates has no fence and cannot be detected automatically.
      </p>

      {canManage ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(
              { method: 'POST', body: JSON.stringify(form) },
              `Branch "${form.name.trim()}" added`
            ).then((json) => {
              if (json) setForm({ name: '', locationType: 'warehouse', latitude: '', longitude: '' });
            });
          }}
        >
          <div className="min-w-[10rem] flex-1">
            <label className={FORM_LABEL_CLASS} htmlFor="branch-name">Branch name</label>
            <input
              id="branch-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={FORM_INPUT_CLASS}
              placeholder="Gomti Nagar Showroom"
            />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor="branch-type">Type</label>
            <select
              id="branch-type"
              value={form.locationType}
              onChange={(e) => setForm((f) => ({ ...f, locationType: e.target.value }))}
              className={FORM_INPUT_CLASS}
            >
              {BRANCH_TYPES.map((type) => (
                <option key={type} value={type}>{TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className={FORM_LABEL_CLASS} htmlFor="branch-lat">Latitude</label>
            <input
              id="branch-lat"
              inputMode="decimal"
              value={form.latitude}
              onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
              className={FORM_INPUT_CLASS}
              placeholder="Optional"
            />
          </div>
          <div className="w-32">
            <label className={FORM_LABEL_CLASS} htmlFor="branch-lng">Longitude</label>
            <input
              id="branch-lng"
              inputMode="decimal"
              value={form.longitude}
              onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
              className={FORM_INPUT_CLASS}
              placeholder="Optional"
            />
          </div>
          <button type="button" onClick={locate} disabled={locating} className={PILL_BUTTON_CLASS}>
            <Crosshair className="h-3.5 w-3.5" />
            {locating ? 'Locating…' : 'Use my location'}
          </button>
          <button type="submit" className={PILL_PRIMARY_BUTTON_CLASS}>
            <Plus className="h-3.5 w-3.5" />
            Add branch
          </button>

          {form.locationType === 'showroom' ? (
            <p className="w-full text-[11px] font-bold text-amber-600">
              Note: showroom stock counters are company-wide, so a second showroom shares one stock pool. Attendance and
              geofencing are per branch either way.
            </p>
          ) : null}
          {geoError ? <p className="w-full text-[11px] font-bold text-amber-600">{geoError}</p> : null}
        </form>
      ) : null}

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="py-8 text-center text-xs font-bold text-slate-400">Loading…</p>
        ) : !branches.length ? (
          <p className="py-8 text-center text-xs font-bold text-slate-400">No branches yet.</p>
        ) : (
          branches.map((branch) => (
            <BranchRow
              key={branch.id}
              branch={branch}
              onSave={(changes) =>
                send(
                  { method: 'PATCH', body: JSON.stringify({ locationId: branch.id, ...changes }) },
                  changes.name && changes.name !== branch.name
                    ? `Renamed to "${changes.name}"`
                    : `Saved ${branch.name}`
                )
              }
              onRetire={() =>
                send(
                  { method: 'PATCH', body: JSON.stringify({ locationId: branch.id, isActive: false }) },
                  `${branch.name} retired. Its past records are untouched.`
                )
              }
              onRestore={() =>
                send(
                  { method: 'PATCH', body: JSON.stringify({ locationId: branch.id, isActive: true }) },
                  `${branch.name} restored`
                )
              }
            />
          ))
        )}
      </div>

      {feedback.message ? (
        <p className={`mt-3 text-xs font-bold ${feedback.kind === 'error' ? 'text-rose-500' : 'text-emerald-600'}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
