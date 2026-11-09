import Link from "next/link";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import type { Crumb } from "@/lib/crumbs";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AdminTitle({
  title,
  intro,
  actions,
  crumbs,
}: {
  title: string;
  intro?: string;
  actions?: React.ReactNode;
  // The trail for a page two or more levels deep (see breadcrumbs.tsx). Left out on top-level pages.
  crumbs?: Crumb[];
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
        <h1 className="text-2xl font-bold text-primary-ink md:text-3xl">{title}</h1>
        {intro ? <p className="max-w-prose text-base text-muted-foreground">{intro}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
  href,
  children,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <Card className="h-full gap-2 p-4 md:p-4">
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
      <span className="text-3xl font-bold">{value}</span>
      {children}
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="block h-full min-w-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

// Previous and next links that keep the other filters in the address.
export function Pagination({
  basePath,
  params,
  page,
  pageCount,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const href = (target: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    qs.set("page", String(target));
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonVariants({ variant: "outline", size: "md" })}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-center text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={buttonVariants({ variant: "outline", size: "md" })}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export { Button, cn };
