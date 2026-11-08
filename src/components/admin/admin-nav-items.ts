import {
  Briefcase,
  Download,
  History,
  Inbox,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";

import { STAFF_SETTINGS_PATH, can, type Action, type Role } from "@/lib/permissions";

// The admin menu. Each item shows only when the role may do its action (src/lib/permissions.ts).
// Hiding an item is not security: every page, action and route checks again, and so does the database.
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  action: Action;
  // Also shown in the bottom bar on a phone.
  phone?: boolean;
  // Shown only for roles that do NOT have this action (staff get "Services" instead of "Settings").
  unless?: Action;
};

export const NAV_ITEMS: NavItem[] = [
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

export function navItemsFor(role: Role, variant: "sidebar" | "bottom"): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      can(role, item.action) &&
      !(item.unless && can(role, item.unless)) &&
      (variant === "bottom" ? item.phone : true),
  );
}
