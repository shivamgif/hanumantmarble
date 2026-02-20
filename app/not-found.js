import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Search, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Page Not Found – Hanumant Marble",
  description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 text-center relative z-10">
        {/* Large 404 */}
        <p className="text-8xl sm:text-9xl font-extrabold text-primary/10 select-none mb-4 leading-none">
          404
        </p>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          Page Not Found
        </h1>

        <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto mb-10 leading-relaxed">
          Oops! The page you're looking for doesn't exist or may have been moved.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="rounded-full px-8 h-12">
            <Link href="/" className="flex items-center gap-2">
              <Home className="h-4 w-4" aria-hidden="true" />
              Back to Home
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-8 h-12">
            <Link href="/quote" className="flex items-center gap-2">
              <Search className="h-4 w-4" aria-hidden="true" />
              Get a Quote
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
