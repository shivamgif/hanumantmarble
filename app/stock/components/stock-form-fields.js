'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { UploadCloud, ChevronRight, Search, Check, X as XIcon } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { FORM_LABEL_CLASS, FORM_INPUT_CLASS } from '../lib/stock-utils';

const MAX_RESULTS = 200;

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [breakpoint]);
  return isMobile;
}

function ComboboxRow({ active, selected, onSelect, onHover, children, rowRef }) {
  return (
    <li>
      <button
        ref={rowRef}
        type="button"
        role="option"
        aria-selected={selected}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
          active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect();
        }}
        onMouseMove={onHover}
      >
        {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-brand-primary" /> : <span className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
    </li>
  );
}

function MobilePickerSheet({ open, onOpenChange, title, placeholder, searchValue, onSearchChange, rows, renderLabel, isSelected, onSelect, creatable = false, onCreate, hasExactMatch = false }) {
  const trimmed = searchValue.trim();
  const showCreate = creatable && trimmed.length > 0 && !hasExactMatch;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0 gap-0">
        <div className="sticky top-0 z-10 border-b border-border bg-background px-4 pt-5 pb-3 space-y-2">
          <SheetTitle className="text-sm font-black uppercase tracking-widest text-slate-500">{title}</SheetTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={placeholder}
              className="pl-9 pr-9"
              autoComplete="off"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:bg-accent"
                aria-label="Clear"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {showCreate ? (
            <ul className="space-y-0.5 mb-1">
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20"
                  onMouseDown={(e) => { e.preventDefault(); onCreate(trimmed); }}
                  onClick={(e) => { e.preventDefault(); onCreate(trimmed); }}
                >
                  <span className="h-3.5 w-3.5 shrink-0 text-xs font-black">+</span>
                  <span className="truncate">Use &quot;{trimmed}&quot;</span>
                </button>
              </li>
            </ul>
          ) : null}
          {rows.length === 0 && !showCreate ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</div>
          ) : (
            <ul className="space-y-0.5">
              {rows.map((row, i) => (
                <ComboboxRow
                  key={row.key ?? i}
                  active={false}
                  selected={isSelected(row)}
                  onSelect={() => onSelect(row)}
                  onHover={() => {}}
                >
                  {renderLabel(row)}
                </ComboboxRow>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

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

export function SuggestCombobox({ value, onChange, options = [], placeholder, className, onBlur, disabled, inputRef, ...props }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mobileSearch, setMobileSearch] = useState('');
  const isMobile = useIsMobile();
  const activeRowRef = useRef(null);

  const current = String(value ?? '');
  const desktopNeedle = current.trim().toLowerCase();
  const mobileNeedle = mobileSearch.trim().toLowerCase();
  const needle = isMobile ? mobileNeedle : desktopNeedle;

  const filtered = useMemo(() => [...new Set((options || [])
    .filter((opt) => opt != null && String(opt).trim() !== '')
    .map((opt) => String(opt))
    .filter((opt) => (needle ? opt.toLowerCase().includes(needle) : true)))]
    .slice(0, MAX_RESULTS), [options, needle]);

  useEffect(() => { setActiveIndex(0); }, [needle, open]);

  useEffect(() => {
    if (open && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  const commit = useCallback((opt) => {
    onChange(String(opt));
    setOpen(false);
    setMobileSearch('');
  }, [onChange]);

  const handleChange = useCallback((e) => {
    onChange(e.target.value);
    if (!open && !isMobile) setOpen(true);
  }, [onChange, open, isMobile]);

  const handleFocus = useCallback(() => {
    if (isMobile) {
      setMobileSearch(current);
      setOpen(true);
    } else {
      setOpen(true);
    }
  }, [isMobile, current]);

  const handleKeyDown = useCallback((e) => {
    if (!open || isMobile) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      if (filtered.length > 0) {
        e.preventDefault();
        commit(filtered[activeIndex] ?? filtered[0]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, isMobile, filtered, activeIndex, commit]);

  if (isMobile) {
    return (
      <>
        <Input
          ref={inputRef}
          value={current}
          readOnly
          onFocus={handleFocus}
          onClick={handleFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          className={className || FORM_INPUT_CLASS}
          disabled={disabled}
          autoComplete="off"
          {...props}
        />
        <MobilePickerSheet
          open={open}
          onOpenChange={(v) => { setOpen(v); if (!v) setMobileSearch(''); }}
          title={placeholder || 'Select'}
          placeholder={placeholder || 'Search or type new...'}
          searchValue={mobileSearch}
          onSearchChange={(v) => { setMobileSearch(v); onChange(v); }}
          rows={filtered.map((opt) => ({ key: opt, value: opt }))}
          renderLabel={(row) => row.value}
          isSelected={(row) => row.value === current}
          onSelect={(row) => commit(row.value)}
          creatable
          hasExactMatch={filtered.some((opt) => opt.toLowerCase() === mobileSearch.trim().toLowerCase())}
          onCreate={(v) => commit(v)}
        />
      </>
    );
  }

  return (
    <Popover open={open && (filtered.length > 0 || desktopNeedle.length > 0)} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={current}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className || FORM_INPUT_CLASS}
          disabled={disabled}
          autoComplete="off"
          {...props}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="min-w-[280px] w-[max(var(--radix-popover-trigger-width),320px)] max-h-[min(60vh,28rem)] p-1 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={() => setOpen(false)}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</div>
        ) : (
          <ScrollArea className="max-h-[min(60vh,28rem)]">
            <ul className="space-y-0.5 pr-1" role="listbox">
              {filtered.map((opt, i) => (
                <ComboboxRow
                  key={`${opt}-${i}`}
                  rowRef={i === activeIndex ? activeRowRef : null}
                  active={i === activeIndex}
                  selected={opt === current}
                  onSelect={() => commit(opt)}
                  onHover={() => setActiveIndex(i)}
                >
                  {opt}
                </ComboboxRow>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

function itemLabel(item) {
  const grade = item.grade ? ` · ${item.grade}` : '';
  const bag = item.unit_of_measure === 'bag' ? ' (Bag)' : '';
  return `${item.sku} - ${item.name}${grade}${bag}`;
}

// Available stock summary for picker rows — helps distinguish near-duplicate
// SKUs (same name, different stock) at selection time. Display-only.
function itemStockSummary(item) {
  const whole = Number(item.current_whole_qty ?? 0);
  const broken = Number(item.current_broken_qty ?? 0);
  const unit = item.unit_of_measure === 'bag' ? 'bags' : 'whole';
  const parts = [`${whole} ${unit}`];
  if (broken > 0) parts.push(`${broken} broken`);
  return parts.join(' · ');
}

export function ItemSuggestCombobox({ value, onChange, onItemSelect, items = [], placeholder, className, onBlur, disabled, fallbackLabel, ...props }) {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mobileSearch, setMobileSearch] = useState('');
  const isMobile = useIsMobile();
  const activeRowRef = useRef(null);

  useEffect(() => {
    if (!isTyping) {
      const found = (items || []).find((i) => String(i.id) === String(value));
      setInputText(found ? itemLabel(found) : (fallbackLabel || ''));
    }
  }, [value, items, isTyping, fallbackLabel]);

  const desktopNeedle = isTyping ? inputText.trim().toLowerCase() : '';
  const mobileNeedle = mobileSearch.trim().toLowerCase();
  const needle = isMobile ? mobileNeedle : desktopNeedle;

  const filtered = useMemo(() => {
    return (items || [])
      .filter((i) => {
        if (!needle) return true;
        const sku = (i.sku || '').toLowerCase();
        const name = (i.name || '').toLowerCase();
        const grade = (i.grade || '').toLowerCase();
        return sku.includes(needle) || name.includes(needle) || grade.includes(needle);
      })
      .slice(0, MAX_RESULTS);
  }, [items, needle]);

  useEffect(() => { setActiveIndex(0); }, [needle, open]);

  useEffect(() => {
    if (open && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  const handleSelect = useCallback((item) => {
    setIsTyping(false);
    setInputText(itemLabel(item));
    setOpen(false);
    setMobileSearch('');
    onChange(String(item.id));
    onItemSelect?.(item);
  }, [onChange, onItemSelect]);

  const tryAutoSelect = useCallback(() => {
    const raw = inputText.trim().toLowerCase();
    if (!raw) return false;
    const exact = (items || []).find((i) => (i.sku || '').toLowerCase() === raw);
    if (exact) { handleSelect(exact); return true; }
    if (filtered.length === 1 && !isMobile) { handleSelect(filtered[0]); return true; }
    return false;
  }, [inputText, items, filtered, handleSelect, isMobile]);

  const handleChange = useCallback((e) => {
    setInputText(e.target.value);
    setIsTyping(true);
    if (!open) setOpen(true);
  }, [open]);

  const handleFocus = useCallback(() => {
    if (isMobile) {
      setMobileSearch('');
      setOpen(true);
    } else {
      setOpen(true);
    }
  }, [isMobile]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      if (open && filtered.length > 0) {
        e.preventDefault();
        handleSelect(filtered[activeIndex] ?? filtered[0]);
      }
    } else if (e.key === 'Tab') {
      tryAutoSelect();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, filtered, activeIndex, handleSelect, tryAutoSelect]);

  const handleBlur = useCallback((e) => {
    tryAutoSelect();
    setIsTyping(false);
    onBlur?.(e);
  }, [onBlur, tryAutoSelect]);

  if (isMobile) {
    return (
      <>
        <Input
          value={inputText}
          readOnly
          onFocus={handleFocus}
          onClick={handleFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          className={className || FORM_INPUT_CLASS}
          disabled={disabled}
          autoComplete="off"
          {...props}
        />
        <MobilePickerSheet
          open={open}
          onOpenChange={(v) => { setOpen(v); if (!v) setMobileSearch(''); }}
          title={placeholder || 'Select item'}
          placeholder="Search by SKU, name, grade..."
          searchValue={mobileSearch}
          onSearchChange={setMobileSearch}
          rows={filtered.map((it) => ({ key: it.id, item: it }))}
          renderLabel={(row) => (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{itemLabel(row.item)}</span>
              <span className="text-[11px] font-medium text-muted-foreground">{itemStockSummary(row.item)}</span>
            </span>
          )}
          isSelected={(row) => String(row.item.id) === String(value)}
          onSelect={(row) => handleSelect(row.item)}
        />
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={inputText}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className || FORM_INPUT_CLASS}
          disabled={disabled}
          autoComplete="off"
          {...props}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="min-w-[320px] w-[max(var(--radix-popover-trigger-width),420px)] max-h-[min(60vh,28rem)] p-1 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={() => setOpen(false)}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</div>
        ) : (
          <ScrollArea className="max-h-[min(60vh,28rem)]">
            <ul className="space-y-0.5 pr-1" role="listbox">
              {filtered.map((item, i) => (
                <ComboboxRow
                  key={item.id}
                  rowRef={i === activeIndex ? activeRowRef : null}
                  active={i === activeIndex}
                  selected={String(item.id) === String(value)}
                  onSelect={() => handleSelect(item)}
                  onHover={() => setActiveIndex(i)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{itemLabel(item)}</span>
                    <span className="text-[11px] font-medium text-muted-foreground">{itemStockSummary(item)}</span>
                  </span>
                </ComboboxRow>
              ))}
            </ul>
          </ScrollArea>
        )}
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

export function StockFormField({ control, name, label, placeholder, type = 'text', className, digitsOnly, invoiceChars, ...props }) {
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
              onChange={(e) => {
                if (digitsOnly) {
                  const val = e.target.value.replace(/\D/g, '');
                  field.onChange(val);
                } else if (invoiceChars) {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, '');
                  field.onChange(val);
                } else {
                  field.onChange(e);
                }
              }}
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
          <div className="relative group/money">
            <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[13px] font-black text-dark transition-colors group-focus-within/money:text-brand-primary">₹</span>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                type="number"
                min="0"
                step="0.01"
                placeholder={placeholder}
                className={`${FORM_INPUT_CLASS} pl-10`}
              />
            </FormControl>
          </div>
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
