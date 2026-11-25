import { Skeleton } from '@/components/ui/skeleton';

// Shown inside the shell the instant a stock link is clicked, while the next
// page's code arrives, so a click never looks ignored.
export default function StockLoading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:space-y-6 sm:p-6" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
