import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

// Shown at once when someone clicks a menu item in the admin area (Dashboard, Requests, Settings, Activity,
// Export, and every page below them), while the page is still loading its data. Next.js uses this file as the
// instant "loading" screen for every admin page. The menu and the header stay in place.
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      {/* Like the gray shapes below, the spinner appears only after 200 ms, so a quick page shows no flash. */}
      <div className="flex animate-delayed-in items-center gap-3 text-primary-ink">
        <Loader2
          aria-hidden="true"
          className="size-6 animate-spin text-primary motion-reduce:animate-none"
        />
        <span className="text-lg font-bold">Loading...</span>
      </div>
      {/* The shape of a page, so the content does not jump when it arrives. */}
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
