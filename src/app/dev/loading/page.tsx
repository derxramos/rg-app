import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/components/admin/admin-shell-skeleton";
import {
  CardGridSkeleton,
  DashboardSkeleton,
  DetailSkeleton,
  FormSkeleton,
  ListSkeleton,
} from "@/components/admin/page-skeletons";

// Development only: shows the loading placeholders so they can be checked by eye. Blocked in production.
//   /dev/loading            the admin frame (first load or a hard refresh)
//   /dev/loading?shapes=1   the page shapes (when a menu item is clicked)
export const metadata: Metadata = {
  title: "Loading check (development only)",
  robots: { index: false, follow: false },
};

// The address part (?shapes) is only known when the page is asked for, so it is read inside Suspense.
export default function LoadingPreviewPage({ searchParams }: PageProps<"/dev/loading">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({
  searchParams,
}: {
  searchParams: PageProps<"/dev/loading">["searchParams"];
}) {
  const { shapes } = await searchParams;
  if (!shapes) return <AdminShellSkeleton />;
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-12 p-6">
      {[
        ["Dashboard", <DashboardSkeleton key="d" />],
        [
          "List (Requests, Activity, Admin users, Services, Payment methods)",
          <ListSkeleton key="l" />,
        ],
        ["Card grid (Settings)", <CardGridSkeleton key="g" />],
        ["Detail (one request)", <DetailSkeleton key="t" />],
        [
          "Form (site content, file settings, edit service or payment method)",
          <FormSkeleton key="f" />,
        ],
      ].map(([name, shape]) => (
        <section key={String(name)} className="flex flex-col gap-3 border-b pb-8">
          <h2 className="text-sm font-bold text-muted-foreground">{name as string}</h2>
          {shape as React.ReactNode}
        </section>
      ))}
    </main>
  );
}
