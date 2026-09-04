"use client"

// `<input type="month">` degrades to a bare text box in Safari and Firefox,
// so this is a real picker: year stepper + 12-month grid on the existing Popover.
import { useState } from "react"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const pad = (n) => String(n).padStart(2, "0")

/** value / onChange use "YYYY-MM"; max is an optional "YYYY-MM" ceiling. */
export function MonthPicker({ value, onChange, max, className, disabled }) {
  const [open, setOpen] = useState(false)
  const [selectedYear, selectedMonth] = (value || "").split("-").map(Number)
  const [year, setYear] = useState(selectedYear || new Date().getFullYear())

  const [maxYear, maxMonth] = (max || "").split("-").map(Number)
  const isAfterMax = (y, m) => Boolean(max) && (y > maxYear || (y === maxYear && m > maxMonth))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Reopening should land on the selected month, not wherever the user browsed to.
        if (next) setYear(selectedYear || new Date().getFullYear())
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className={cn("justify-start rounded-xl text-left font-semibold", className)}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedYear ? `${MONTHS[selectedMonth - 1]} ${selectedYear}` : "Pick a month"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex items-center justify-between pb-2">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-black tabular-nums">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            disabled={Boolean(max) && year >= maxYear}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((label, index) => {
            const month = index + 1
            const isSelected = year === selectedYear && month === selectedMonth
            return (
              <button
                key={label}
                type="button"
                disabled={isAfterMax(year, month)}
                onClick={() => {
                  onChange(`${year}-${pad(month)}`)
                  setOpen(false)
                }}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-bold transition hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
