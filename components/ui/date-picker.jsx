"use client"

import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function DatePicker({ value, onChange, placeholder = "Pick a date", className, disabled, ...props }) {
  const selectedDate = value ? new Date(value) : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Sized and still like the text inputs beside it (h-9, no hover lift):
            the Button default is 40px and rises on hover, which sat it lower in a row. */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "w-full justify-start rounded-lg text-left font-normal hover:translate-y-0 active:scale-100",
            !selectedDate && "text-muted-foreground",
            className
          )}
          disabled={disabled}
          {...props}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedDate ? format(selectedDate, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
