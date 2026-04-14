import { cn } from "@/lib/utils"

const badgeVariants = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
  outline: "text-foreground",
  approved: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  pending: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  rejected: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  neutral: "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-300",
}

export function Badge({ className, variant = "default", ...props }) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  )
}
