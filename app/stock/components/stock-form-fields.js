'use client';

import { useState, useCallback, useMemo } from 'react';
import { UploadCloud } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { FORM_LABEL_CLASS, FORM_INPUT_CLASS } from '../lib/stock-utils';

export function InlineNotice({ notice }) {
  if (!notice) return null;

  const toneClasses =
    notice.type === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : notice.type === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return <div className={`rounded-lg border px-3 py-2 text-sm ${toneClasses}`}>{notice.message}</div>;
}

export function AttachmentField({ label, accept = 'image/*,.pdf', onChange, file, hint }) {
  return (
    <label className="block cursor-pointer">
      <span className={`${FORM_LABEL_CLASS} mb-2 flex items-center gap-2`}>{label}</span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 transition hover:border-primary/50 hover:bg-primary/10">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{file ? 'Replace file' : 'Choose file'}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{hint || 'Attach a photo or PDF.'}</div>
            <div className="mt-2 text-xs font-medium text-primary">{file ? file.name : 'Click to upload'}</div>
          </div>
        </div>
      </div>
    </label>
  );
}

export function FormSectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

export function SuggestCombobox({ value, onChange, options = [], placeholder, className, onBlur, disabled, inputRef }) {
  const [open, setOpen] = useState(false);
  const current = String(value ?? '');
  const needle = current.trim().toLowerCase();
  const filtered = useMemo(() => (options || [])
    .filter((opt) => opt != null && String(opt).trim() !== '')
    .filter((opt) => (needle ? String(opt).toLowerCase().includes(needle) : true))
    .slice(0, 50), [options, needle]);

  const handleChange = useCallback((e) => {
    onChange(e.target.value);
    if (!open) setOpen(true);
  }, [onChange, open]);

  const handleFocus = useCallback(() => setOpen(true), []);

  const handleBlur = useCallback((e) => {
    setTimeout(() => setOpen(false), 120);
    onBlur?.(e);
  }, [onBlur]);

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={current}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={className || FORM_INPUT_CLASS}
          disabled={disabled}
          autoComplete="off"
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] max-h-64 overflow-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ul className="space-y-0.5">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(String(opt));
                  setOpen(false);
                }}
              >
                {String(opt)}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function SuggestComboboxField({ control, name, label, placeholder, options, className, disabled, onChangeExtra }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label ? <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel> : null}
          <FormControl>
            <SuggestCombobox
              value={field.value ?? ''}
              onChange={(v) => {
                field.onChange(v);
                onChangeExtra?.(v);
              }}
              onBlur={field.onBlur}
              options={options}
              placeholder={placeholder}
              className={className}
              disabled={disabled}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export function StockFormField({ control, name, label, placeholder, type = 'text', className, ...props }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label ? <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel> : null}
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ''}
              type={type}
              placeholder={placeholder}
              className={className || FORM_INPUT_CLASS}
              {...props}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export function StockMoneyField({ control, name, label, hint, placeholder = '0.00' }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel>
          <FormControl>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
              <Input
                {...field}
                value={field.value ?? ''}
                type="number"
                min="0"
                step="0.01"
                placeholder={placeholder}
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-12 pr-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </FormControl>
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export function StockDateField({ control, name, label, placeholder, className }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel>
          <FormControl>
            <DatePicker
              value={field.value}
              onChange={field.onChange}
              placeholder={placeholder}
              className={className || FORM_INPUT_CLASS}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export function StockDateTimeField({ control, name, label, placeholder, className }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel>
          <FormControl>
            <DateTimePicker
              value={field.value}
              onChange={field.onChange}
              datePlaceholder={placeholder}
              className={className}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
