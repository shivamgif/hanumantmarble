import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "skeleton rounded-lg",
        className
      )}
      {...props}
    />
  );
}

/**
 * The one loading screen of the stock app: title, a row of four tiles, one
 * block — the shape most pages land in. Used while a page's code or first data
 * loads, and by the shell while sign-in and access are checked.
 */
export function PageSkeleton({ label = "Loading" }) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:space-y-6 sm:p-6" role="status" aria-busy="true" aria-label={label}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

/** A list or table still loading inside a page: grey rows, same as PageSkeleton's blocks. */
export function ListSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12" />)}
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-lg border-0 bg-card/50 shadow-float overflow-hidden">
      {/* Image area */}
      <Skeleton className="h-48 sm:h-64 w-full rounded-none" />
      {/* Content */}
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {/* Footer */}
      <div className="px-4 sm:px-6 pb-4 sm:pb-6 flex justify-between items-center">
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
