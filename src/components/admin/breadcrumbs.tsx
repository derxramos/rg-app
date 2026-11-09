import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import type { Crumb } from "@/lib/crumbs";
import { cn, focusRing } from "@/lib/utils";

// "Where am I, and how do I go back?" for pages two or more levels deep (Settings > Payment methods > GCash).
//   From 640 px: the whole trail. Every step except the last is a link. The last step is the current page.
//   On a phone: ONE link to the parent page ("< Payment methods") with a 44 px tap target, because a long trail
//   does not fit on a small screen.
// With fewer than two steps there is nothing to go back to, so nothing is shown. A long name is cut with "..." and
// its full text is in the tooltip. Pages pass the steps (see AdminTitle).
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length < 2) return null;
  const parent = [...items].reverse().find((item) => item.href);
  const current = items[items.length - 1];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="hidden min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-sm sm:flex">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "max-w-56 truncate rounded-sm font-bold text-primary underline-offset-4 hover:underline",
                    focusRing,
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  title={item.label}
                  className="max-w-72 truncate text-muted-foreground"
                >
                  {item.label}
                </span>
              )}
              {last ? null : (
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
            </li>
          );
        })}
      </ol>
      {parent?.href ? (
        <Link
          href={parent.href}
          aria-label={`Back to ${parent.label}`}
          title={parent.label}
          className={cn(
            "-ml-2 inline-flex min-h-11 max-w-full items-center gap-1 rounded-md px-2 text-base font-bold text-primary sm:hidden",
            focusRing,
          )}
        >
          <ChevronLeft aria-hidden="true" className="size-5 shrink-0" />
          <span className="truncate">{parent.label}</span>
        </Link>
      ) : (
        <span className="sr-only sm:hidden">{current.label}</span>
      )}
    </nav>
  );
}
