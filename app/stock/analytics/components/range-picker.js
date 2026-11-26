'use client';
// The one time window for the whole analytics page. Presets as rows (nobody
// fights a calendar for "last 30 days"); a custom range behind a hairline,
// with the browser's own date inputs.
import { useState } from 'react';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RANGE_PRESETS, istToday } from '@/lib/analytics-range.mjs';
import { formatRangeLabel } from '../../components/dashboard-ui';

export function RangePicker({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const today = istToday();
  const label = value.preset ? t(`preset_${value.preset}`) : t('preset_custom');

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFrom(value.from);
          setTo(value.to);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-ring"
        >
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <span>{label}</span>
          <span className="hidden text-muted-foreground sm:inline">{formatRangeLabel(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <ul role="listbox" aria-label={t('timeWindow')}>
          {RANGE_PRESETS.map((preset) => {
            const selected = value.preset === preset;
            return (
              <li key={preset}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange({ preset });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-ring"
                >
                  <Check className={`h-4 w-4 shrink-0 ${selected ? 'opacity-100' : 'opacity-0'}`} strokeWidth={2.5} />
                  {t(`preset_${preset}`)}
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="mt-1 space-y-2 border-t border-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from || !to) return;
            onChange({ from: from <= to ? from : to, to: from <= to ? to : from });
            setOpen(false);
          }}
        >
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Check className={`h-3.5 w-3.5 ${value.preset ? 'opacity-0' : 'opacity-100'}`} strokeWidth={2.5} />
            {t('preset_custom')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11px] text-muted-foreground">
              {t('rangeFrom')}
              <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-ring" />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              {t('rangeTo')}
              <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-ring" />
            </label>
          </div>
          <button type="submit" className="h-8 w-full rounded-md bg-primary text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-ring">
            {t('applyRange')}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
