"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItemsFor } from "@/components/admin/admin-nav-items";
import type { Role } from "@/lib/permissions";
import { cn, focusRing } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

// Sidebar from 1024 px. On a phone: a bottom bar with 4 items, 60 px tall.
export function AdminNav({ role, variant }: { role: Role; variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const items = navItemsFor(role, variant);

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Admin"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[60px] border-t bg-background lg:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-xs",
              isActive(pathname, href)
                ? "bg-primary-soft font-bold text-primary-ink"
                : "text-foreground",
              focusRing,
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Admin"
      className="hidden w-64 shrink-0 flex-col gap-1 border-r bg-background p-4 lg:flex"
    >
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-md px-3 text-base",
            isActive(pathname, href)
              ? "bg-primary-soft font-bold text-primary-ink"
              : "text-foreground hover:bg-accent",
            focusRing,
          )}
        >
          <Icon aria-hidden="true" className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
