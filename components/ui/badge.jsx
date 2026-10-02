import { cn } from "@/lib/utils"

const badgeVariants = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
  outline: "text-foreground",
  approved: "border-emerald-600/20 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-400 capitalize before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
  pending: "border-amber-600/25 bg-amber-500/[0.06] text-amber-700 dark:text-amber-400 capitalize before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
  rejected: "border-rose-600/20 bg-rose-500/[0.06] text-rose-700 dark:text-rose-400 capitalize before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
  neutral: "border-border bg-transparent text-slate-600 dark:text-slate-300 capitalize before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
}

export function Badge({ className, variant = "default", ...props }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  )
}
