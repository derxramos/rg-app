import { Briefcase, FileCog, Globe, UserCog, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminTitle } from "@/components/admin/bits";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { guardAdminPage } from "@/server/auth/admin";

export const metadata: Metadata = { title: "Settings" };

const ITEMS: {
  href: string;
  title: string;
  text: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
}[] = [
  {
    href: "/admin/settings/payments",
    title: "Payment methods",
    text: "QR codes and account details clients pay to.",
    icon: Wallet,
    ownerOnly: true,
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
    ownerOnly: true,
  },
  {
    href: "/admin/settings/users",
    title: "Admin users",
    text: "Invite staff, change roles, turn accounts off.",
    icon: UserCog,
    ownerOnly: true,
  },
];

export default async function SettingsHubPage() {
  const admin = await guardAdminPage();
  const items = ITEMS.filter((i) => !i.ownerOnly || admin.role === "owner");
  return (
    <>
      <AdminTitle title="Settings" />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      {admin.role !== "owner" ? (
        <p className="text-sm text-muted-foreground">
          Payment methods, file settings and admin users are for the owner only.
        </p>
      ) : null}
    </>
  );
}
