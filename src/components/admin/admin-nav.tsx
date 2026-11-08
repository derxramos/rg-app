"use client";

import {
  Briefcase,
  Download,
  History,
  Inbox,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { STAFF_SETTINGS_PATH, can, type Action, type Role } from "@/lib/permissions";
import { cn, focusRing } from "@/lib/utils";

// Each item shows only when the role may do its action (src/lib/permissions.ts). Hiding an item is not
// security: every page, action and route checks again, and so does the database.
type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  action: Action;
  phone?: boolean;
  // Shown only for roles that do NOT have this action (staff get "Services" instead of "Settings").
  unless?: Action;
};

const ITEMS: Item[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    action: "dashboard.view",
    phone: true,
  },
  { href: "/admin/requests", label: "Requests", icon: Inbox, action: "requests.view", phone: true },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    action: "accounts.view",
    phone: true,
  },
  {
    href: STAFF_SETTINGS_PATH,
    label: "Services",
    icon: Briefcase,
    action: "services.view",
    phone: true,
    unless: "accounts.view",
  },
  {
    href: "/admin/activity",
    label: "Activity",
    icon: History,
    action: "activity.view",
    phone: true,
  },
  { href: "/admin/export", label: "Export", icon: Download, action: "export.csv" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

// Sidebar from 1024 px. On a phone: a bottom bar with 4 items, 60 px tall.
export function AdminNav({ role, variant }: { role: Role; variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const items = ITEMS.filter(
    (i) =>
      can(role, i.action) &&
      !(i.unless && can(role, i.unless)) &&
      (variant === "bottom" ? i.phone : true),
  );

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
