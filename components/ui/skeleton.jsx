import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800",
        className
      )}
      {...props}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border-0 bg-card/50 shadow-lg overflow-hidden">
      {/* Image area */}
      <Skeleton className="h-48 sm:h-64 w-full rounded-none" />
      {/* Content */}
      <div className="p-4 sm:p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {/* Footer */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 flex justify-between items-center">
        <div className="space-y-1">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
    </div>
  );
}

export function ProductsGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
