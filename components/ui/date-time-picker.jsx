"use client"

import { useMemo } from "react"

import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"

export function DateTimePicker({ value, onChange, datePlaceholder = "Pick a date", disabled, className }) {
  const dateValue = useMemo(() => {
    if (!value) return ""
    return String(value).slice(0, 10)
  }, [value])

  const timeValue = useMemo(() => {
    if (!value || !String(value).includes("T")) return ""
    return String(value).slice(11, 16)
  }, [value])

  function update(datePart, timePart) {
    if (!datePart) {
      onChange("")
      return
    }

    const merged = `${datePart}T${timePart || "00:00"}`
    onChange(merged)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
      <DatePicker
        value={dateValue}
        onChange={(nextDate) => update(nextDate, timeValue)}
        placeholder={datePlaceholder}
        disabled={disabled}
        className={className}
      />
      <Input
        type="time"
        value={timeValue}
        onChange={(event) => update(dateValue, event.target.value)}
        disabled={disabled || !dateValue}
      />
    </div>
  )
}
