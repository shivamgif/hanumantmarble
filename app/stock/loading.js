import { PageSkeleton } from '@/components/ui/skeleton';

// Shown inside the shell the instant a stock link is clicked, while the next
// page's code arrives, so a click never looks ignored.
export default function StockLoading() {
  return <PageSkeleton />;
}
