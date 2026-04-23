'use client';

import { useState, useCallback, useMemo } from 'react';
import { UploadCloud, ChevronRight } from 'lucide-react';
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
      ? 'border-red-200/50 bg-red-500/10 text-red-600 dark:text-red-400'
      : notice.type === 'warning'
        ? 'border-amber-200/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'border-emerald-200/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3.5 text-[11px] font-bold leading-relaxed shadow-sm animate-scale-in ${toneClasses}`}>
      <span className="mt-0.5 inline-block shrink-0 h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {notice.message}
    </div>
  );
}

 export function AttachmentField({ label, accept = 'image/*,.pdf', onChange, file, hint, tc }) {
  return (
    <label className="block cursor-pointer min-w-0">
      <span className={FORM_LABEL_CLASS}>{label}</span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <div className="glass-panel group rounded-2xl border border-white/5 bg-primary/5 p-3.5 sm:p-4 transition-all duration-300 hover:bg-primary/10 hover:shadow-lg active:scale-[0.98] min-w-0">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-slate-800 text-primary shadow-sm group-hover:scale-110 transition-transform duration-500">
            <UploadCloud className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-foreground truncate">{file ? tc.replaceFile : tc.chooseFile}</div>
            <div className="mt-0.5 sm:mt-1 truncate text-xs font-medium text-primary">{file ? file.name : (hint || tc.attachHint)}</div>
          </div>
        </div>
      </div>
    </label>
  );
}

 export function FormSectionTitle({ icon: Icon, title, description, category, tc }) {
  return (
    <div className="flex items-start gap-4 mb-4">
      <div className="space-y-1.5">
        <nav className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
          <span>{category || tc.formSection}</span>
          <ChevronRight className="h-2.5 w-2.5 opacity-50" />
          <span className="text-brand-primary">{tc.controlLabel}</span>
        </nav>
        <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{title}</h3>
        {description ? <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold leading-relaxed opacity-70">{description}</p> : null}
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
            <div className="relative group/money">
              <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[13px] font-black text-dark transition-colors group-focus-within/money:text-brand-primary">₹</span>
              <Input
                {...field}
                value={field.value ?? ''}
                type="number"
                min="0"
                step="0.01"
                placeholder={placeholder}
                className={`${FORM_INPUT_CLASS} pl-10`}
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
