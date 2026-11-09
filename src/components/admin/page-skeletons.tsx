import { Skeleton } from "@/components/ui/skeleton";

// The gray shapes shown in the content area while an admin page loads (the second loading signal; the thin top
// bar is the first, see navigation-progress.tsx). Each shape looks like the page that is coming, so nothing
// jumps when it arrives. They have no text and no spinner. Skeleton fades in after 200 ms, so a fast page
// shows no gray. Used by the loading.tsx files in src/app/admin/(protected).

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Loading page" className="flex flex-col gap-6">
      <span className="sr-only">Loading page</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
}

function Title() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-9 w-1/3 min-w-40" />
      <Skeleton className="h-5 w-2/3 max-w-prose" />
    </div>
  );
}

// Dashboard and any page without its own shape: the title, a row of cards and one big card.
export function DashboardSkeleton() {
  return (
    <Frame>
      <Title />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </Frame>
  );
}

// Requests, Activity, Admin users, Services, Payment methods: the title, a search row and a list of rows.
export function ListSkeleton() {
  return (
    <Frame>
      <Title />
      <div className="flex gap-3">
        <Skeleton className="h-11 w-full max-w-sm" />
        <Skeleton className="h-11 w-28" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <Skeleton key={item} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </Frame>
  );
}

// The Settings hub: the title and a grid of cards (same columns as the real page).
export function CardGridSkeleton() {
  return (
    <Frame>
      <Title />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <Skeleton key={item} className="h-32 rounded-lg" />
        ))}
      </div>
    </Frame>
  );
}

// One request: a wide column and a narrow column from 1280 px.
export function DetailSkeleton() {
  return (
    <Frame>
      <Title />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    </Frame>
  );
}

// A settings form: the title and one form card (at most 720 px wide, like the real forms).
export function FormSkeleton() {
  return (
    <Frame>
      <Title />
      <div className="flex w-full max-w-[720px] flex-col gap-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-40" />
      </div>
    </Frame>
  );
}
