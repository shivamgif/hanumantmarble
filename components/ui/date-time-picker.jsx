"use client"

import { useMemo } from "react"
import { Clock3 } from "lucide-react"

import { DatePicker } from "@/components/ui/date-picker"
import { cn } from "@/lib/utils"

export function DateTimePicker({ value, onChange, datePlaceholder = "Pick a date", disabled, className }) {
  const dateValue = useMemo(() => {
    if (!value) return ""
    return String(value).slice(0, 10)
  }, [value])

  const timeValue = useMemo(() => {
    if (!value || !String(value).includes("T")) return ""
    return String(value).slice(11, 16)
  }, [value])

  function getCurrentTime() {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, "0")
    const minutes = String(now.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
  }

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
        onChange={(nextDate) => update(nextDate, getCurrentTime())}
        placeholder={datePlaceholder}
        disabled={disabled}
        className={className}
      />
      <div
        className={cn(
          "flex h-10 items-center justify-between rounded-xl border border-input bg-muted/40 px-3 text-sm text-foreground",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span>{timeValue || "--:--"}</span>
        <Clock3 className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}
