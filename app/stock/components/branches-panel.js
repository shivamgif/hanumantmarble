'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Crosshair, MapPin, Plus, RotateCcw } from 'lucide-react';
import { CLASSES, FORM_INPUT_CLASS, FORM_LABEL_CLASS, PILL_BUTTON_CLASS, PILL_PRIMARY_BUTTON_CLASS } from '../lib/stock-utils';
import { SelectField } from '@/components/ui/select';
import { GST_STATES, PLACEHOLDER_GSTIN } from '@/lib/gst-invoice.mjs';

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
function BranchRow({ branch, businesses, onSave, onRetire, onRestore }) {
  const [name, setName] = useState(branch.name);
  const [locationType, setLocationType] = useState(branch.locationType);
  const [businessId, setBusinessId] = useState(branch.businessId == null ? '' : String(branch.businessId));
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
    String(lng) !== String(branch.longitude ?? '') ||
    businessId !== (branch.businessId == null ? '' : String(branch.businessId));

  return (
    <div className={`rounded-xl border p-3 ${branch.isActive ? 'border-border/60' : 'border-border/40 opacity-60'}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className={FORM_LABEL_CLASS} htmlFor={`name-${branch.id}`}>
            Name
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {configured ? 'Fenced' : 'No fence'}
            </span>
            {!branch.isActive ? (
              <span className="ml-2 rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-500">
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
          <SelectField
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
          </SelectField>
        </div>

        {businesses ? (
          <div>
            <label className={FORM_LABEL_CLASS} htmlFor={`business-${branch.id}`}>Business (GSTIN)</label>
            <SelectField
              id={`business-${branch.id}`}
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className={FORM_INPUT_CLASS}
            >
              <option value="">None — cannot invoice</option>
              {businesses.map((biz) => (
                <option key={biz.id} value={String(biz.id)}>{biz.legalName} · {biz.gstin}</option>
              ))}
            </SelectField>
          </div>
        ) : null}

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
              ...(businesses ? { businessId: businessId || null } : {}),
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

const BLANK_BUSINESS = {
  legalName: '', tradeName: '', gstin: '', stateCode: '08', address: '', phone: '', email: '',
  bankName: '', bankAccount: '', bankIfsc: '', invoicePrefix: '',
  city: '', pincode: '', upiId: '', ewbThreshold: '50000', einvoiceEnabled: true,
};

/**
 * A legal entity (one GSTIN). Branches below pick the business they trade
 * under; an invoice raised at a branch prints this name, GSTIN and bank, and
 * numbers in this business's series. Used for both "add" and each existing row.
 */
function BusinessForm({ business, canManage, onSubmit, onToggleActive }) {
  const initial = business ? { ...BLANK_BUSINESS, ...business } : BLANK_BUSINESS;
  const [form, setForm] = useState(initial);
  const field = (key) => ({
    id: `biz-${business?.id ?? 'new'}-${key}`,
    value: form[key] ?? '',
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
    className: FORM_INPUT_CLASS,
    disabled: !canManage,
  });
  const dirty = Object.keys(BLANK_BUSINESS).some((key) => String(form[key] ?? '') !== String(initial[key] ?? ''));
  const label = (key, text) => <label className={FORM_LABEL_CLASS} htmlFor={`biz-${business?.id ?? 'new'}-${key}`}>{text}</label>;

  return (
    <form
      className={`rounded-xl border p-3 ${business && !business.isActive ? 'border-border/40 opacity-60' : 'border-border/60'}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit(form);
        if (ok && !business) setForm(BLANK_BUSINESS);
      }}
    >
      {business?.gstin === PLACEHOLDER_GSTIN ? (
        <p className="mb-2 text-[11px] font-bold text-amber-600">
          Placeholder GSTIN — enter the real one before approving any invoice.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">{label('legalName', 'Legal name')}<input required {...field('legalName')} /></div>
        <div>{label('gstin', 'GSTIN')}<input required maxLength={15} {...field('gstin')} placeholder="08ABCDE1234F1Z5" /></div>
        <div>
          {label('stateCode', 'State')}
          <SelectField {...field('stateCode')}>
            {Object.entries(GST_STATES).map(([code, name]) => (
              <option key={code} value={code}>{code} · {name}</option>
            ))}
          </SelectField>
        </div>
        <div className="sm:col-span-2">{label('address', 'Registered address')}<textarea rows={2} {...field('address')} /></div>
        <div>{label('tradeName', 'Trade name')}<input {...field('tradeName')} placeholder="Optional" /></div>
        <div>{label('invoicePrefix', 'Invoice prefix')}<input required maxLength={4} {...field('invoicePrefix')} placeholder="HM" /></div>
        <div>{label('phone', 'Phone')}<input {...field('phone')} /></div>
        <div>{label('email', 'Email')}<input type="email" {...field('email')} /></div>
        <div>{label('bankName', 'Bank')}<input {...field('bankName')} /></div>
        <div>{label('bankAccount', 'Account no.')}<input {...field('bankAccount')} /></div>
        <div>{label('bankIfsc', 'IFSC')}<input {...field('bankIfsc')} /></div>
        {/* The e-invoice and e-way bill portals need a structured address. */}
        <div>{label('city', 'City')}<input required {...field('city')} placeholder="Kishangarh" /></div>
        <div>{label('pincode', 'PIN code')}<input required inputMode="numeric" maxLength={6} {...field('pincode')} /></div>
        <div>{label('upiId', 'UPI ID (payment QR)')}<input {...field('upiId')} placeholder="name@bank" /></div>
        <div>{label('ewbThreshold', 'E-way bill above ₹')}<input inputMode="decimal" {...field('ewbThreshold')} /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.einvoiceEnabled !== false}
            disabled={!canManage}
            onChange={(e) => setForm((f) => ({ ...f, einvoiceEnabled: e.target.checked }))}
          />
          E-invoicing (IRN) on B2B invoices — required above ₹5 crore turnover
        </label>
      </div>
      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" disabled={business && !dirty} className={PILL_PRIMARY_BUTTON_CLASS}>
            {business ? <Building2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {business ? 'Save business' : 'Add business'}
          </button>
          {/* Retire, never delete: issued invoices point at this row. */}
          {business ? (
            <button type="button" onClick={onToggleActive} className={PILL_BUTTON_CLASS}>
              {business.isActive ? 'Retire' : <><RotateCcw className="h-3.5 w-3.5" /> Restore</>}
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function BranchesPanel({ onChanged }) {
  const [branches, setBranches] = useState([]);
  // null until /api/stock/businesses answers; stays null before the sales
  // invoices migration, which hides every business control.
  const [businesses, setBusinesses] = useState(null);
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
    fetch('/api/stock/businesses', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setBusinesses(json ? json.businesses || [] : null))
      .catch(() => setBusinesses(null));
  }, []);

  useEffect(load, [load]);

  async function send(options, successMessage, url = '/api/stock/locations') {
    setFeedback({ kind: '', message: '' });
    try {
      const res = await fetch(url, {
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
            <SelectField
              id="branch-type"
              value={form.locationType}
              onChange={(e) => setForm((f) => ({ ...f, locationType: e.target.value }))}
              className={FORM_INPUT_CLASS}
            >
              {BRANCH_TYPES.map((type) => (
                <option key={type} value={type}>{TYPE_LABELS[type]}</option>
              ))}
            </SelectField>
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

      {businesses ? (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Businesses (GSTIN)</h3>
          <p className="text-[11px] font-bold text-slate-500">
            The legal entities that issue invoices. Each branch below trades under one of them.
          </p>
          {businesses.map((business) => (
            <BusinessForm
              key={`${business.id}-${business.gstin}-${business.isActive}`}
              business={business}
              canManage={canManage}
              onSubmit={(form) =>
                send(
                  { method: 'PATCH', body: JSON.stringify({ businessId: business.id, ...form }) },
                  `Saved ${form.legalName}`,
                  '/api/stock/businesses'
                )
              }
              onToggleActive={() =>
                send(
                  { method: 'PATCH', body: JSON.stringify({ businessId: business.id, isActive: !business.isActive }) },
                  business.isActive ? `${business.legalName} retired` : `${business.legalName} restored`,
                  '/api/stock/businesses'
                )
              }
            />
          ))}
          {canManage ? (
            <BusinessForm
              canManage
              onSubmit={(form) =>
                send({ method: 'POST', body: JSON.stringify(form) }, `Business "${form.legalName}" added`, '/api/stock/businesses')
              }
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="py-8 text-center text-xs font-bold text-slate-400">Loading…</p>
        ) : !branches.length ? (
          <p className="py-8 text-center text-xs font-bold text-slate-400">No branches yet.</p>
        ) : (
          branches.map((branch) => (
            <BranchRow
              key={`${branch.id}-${branch.businessId}`}
              branch={branch}
              businesses={businesses}
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
