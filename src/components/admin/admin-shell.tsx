import { LogOut } from "lucide-react";
import Link from "next/link";

import { logoutAction } from "@/app/admin/(auth)/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import type { AdminProfile } from "@/server/auth/admin-core";

// Header (64 px), sidebar from 1024 px, bottom bar on phones. Wide pages scroll inside the main area.
export function AdminShell({
  admin,
  children,
}: {
  admin: AdminProfile;
  children: React.ReactNode;
}) {
  const isOwner = admin.role === "owner";
  return (
    <div className="flex min-h-dvh flex-col bg-surface-subtle">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background px-4 md:px-6">
        <Link
          href="/admin"
          aria-label="RG'S Bookkeeping & Accounting, admin home"
          className="rounded-md"
        >
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden min-w-0 text-right text-sm sm:block">
            <span className="block truncate font-bold">{admin.fullName}</span>
            <span className="block text-muted-foreground">{isOwner ? "Owner" : "Staff"}</span>
          </span>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut aria-hidden="true" />
              Log out
            </Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1">
        <AdminNav isOwner={isOwner} variant="sidebar" />
        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 pb-24 md:px-8 lg:pb-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
        </main>
      </div>
      <AdminNav isOwner={isOwner} variant="bottom" />
    </div>
  );
}
