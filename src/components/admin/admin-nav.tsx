"use client";

import { Download, History, Inbox, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn, focusRing } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; ownerOnly?: boolean; phone?: boolean };

const ITEMS: Item[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, phone: true },
  { href: "/admin/requests", label: "Requests", icon: Inbox, phone: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, phone: true },
  { href: "/admin/activity", label: "Activity", icon: History, phone: true },
  { href: "/admin/export", label: "Export", icon: Download, ownerOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

// Sidebar from 1024 px. On a phone: a bottom bar with 4 items, 60 px tall.
export function AdminNav({
  isOwner,
  variant,
}: {
  isOwner: boolean;
  variant: "sidebar" | "bottom";
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => (variant === "bottom" ? i.phone : !i.ownerOnly || isOwner));

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Admin"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[60px] grid-cols-4 border-t bg-background lg:hidden"
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
