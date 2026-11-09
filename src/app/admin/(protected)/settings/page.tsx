import {
  Briefcase,
  Download,
  FileCog,
  Globe,
  Scale,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminTitle } from "@/components/admin/bits";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STAFF_SETTINGS_PATH, can, type Action } from "@/lib/permissions";
import { guardPanelPage } from "@/server/auth/panel";

export const metadata: Metadata = { title: "Settings" };

const ITEMS: {
  href: string;
  title: string;
  text: string;
  icon: LucideIcon;
  // Shown only to roles that may do this action. Left out means every role that can open Settings.
  action?: Action;
}[] = [
  {
    href: "/admin/settings/payments",
    title: "Payment methods",
    text: "QR codes and account details clients pay to.",
    icon: Wallet,
  },
  {
    href: "/admin/settings/services",
    title: "Services and checklists",
    text: "What clients can ask for, and the documents they prepare.",
    icon: Briefcase,
  },
  {
    href: "/admin/settings/site",
    title: "Site content",
    text: "Contact details, hours, Messenger and Viber links, home page text.",
    icon: Globe,
  },
  {
    href: "/admin/settings/files",
    title: "File settings",
    text: "How long files are kept, and the limits for uploads.",
    icon: FileCog,
  },
  {
    href: "/admin/settings/legal",
    title: "Privacy and terms",
    text: "Edit the Privacy notice and the Terms. Every save is a new version.",
    icon: Scale,
    action: "legal_text.edit",
  },
  {
    href: "/admin/settings/users",
    title: "Admin users",
    text: "Invite staff, change roles, turn accounts off.",
    icon: UserCog,
  },
];

// Export has no place in the phone bottom bar (it would crowd it), so it is also reachable from here.
const EXPORT_ITEM = {
  href: "/admin/export",
  title: "Export",
  text: "Download requests and payments as CSV files.",
  icon: Download,
};

export default async function SettingsHubPage() {
  const admin = await guardPanelPage();
  // Staff have no Settings page: their menu opens the services page directly.
  if (admin.role === "staff") redirect(STAFF_SETTINGS_PATH);
  const allowed = ITEMS.filter((item) => !item.action || can(admin.role, item.action));
  const items = can(admin.role, "export.csv") ? [...allowed, EXPORT_ITEM] : allowed;
  return (
    <>
      <AdminTitle title="Settings" />
      {/* 1, 2, 3 or 4 columns. A card is never narrower than about 280 px. */}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map(({ href, title, text, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="block h-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Card className="h-full">
                <CardHeader>
                  <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription className="text-base">{text}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
