import { Logo } from "@/components/shared/logo";
import { Skeleton } from "@/components/ui/skeleton";

// What the admin area shows for the first moment of a page load (a hard refresh, or a direct visit), while the
// server checks who is signed in. It has the SAME frame as AdminShell: the 64 px header with the logo, the
// 256 px sidebar from 1024 px, the bottom bar on phones, and the same page padding. Only the parts that depend
// on the person (name, menu items, page content) are placeholders. So the page looks like the app at once and
// nothing jumps when the real page arrives. Keep the sizes in step with admin-shell.tsx and admin-nav.tsx.
export function AdminShellSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh flex-col bg-surface-subtle">
      <span className="sr-only">Loading...</span>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background px-4 md:px-6">
        <span aria-hidden="true">
          <Logo compact className="sm:hidden" />
          <Logo className="hidden sm:inline-flex" />
        </span>
        <div aria-hidden="true" className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="hidden h-9 w-36 sm:block" />
          <Skeleton className="size-11 rounded-md" />
          <Skeleton className="size-11 rounded-md" />
        </div>
      </header>
      <div className="flex flex-1">
        <div
          aria-hidden="true"
          className="hidden w-64 shrink-0 flex-col gap-1 border-r bg-background p-4 lg:flex"
        >
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-11 w-full" />
          ))}
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 pb-[calc(60px+env(safe-area-inset-bottom)+24px)] sm:px-6 lg:pb-10 xl:px-8">
          <div aria-hidden="true" className="mx-auto flex w-full max-w-[1760px] flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-1/3 min-w-40" />
              <Skeleton className="h-5 w-2/3 max-w-prose" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {[0, 1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-28 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </main>
      </div>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[60px] grid-cols-4 items-center gap-4 border-t bg-background px-6 lg:hidden"
      >
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
