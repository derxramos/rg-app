import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { NavigationProgress } from "@/components/admin/navigation-progress";
import { Logo } from "@/components/shared/logo";
import { SignOutForm } from "@/components/shared/sign-out-form";
import { ReloadOnRestore } from "@/components/shared/reload-on-restore";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/permissions";
import type { PanelUser } from "@/server/auth/panel-core";

// Header (64 px), sidebar from 1024 px, bottom bar on phones. Wide pages scroll inside the main area.
export function AdminShell({ admin, children }: { admin: PanelUser; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-subtle">
      <ReloadOnRestore />
      {/* "Loading..." after every click on a link, card, page button or search form. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background px-4 md:px-6">
        <Link
          href="/admin"
          aria-label="RG'S Bookkeeping & Accounting, admin home"
          className="rounded-md"
        >
          {/* On a phone the small line under "RG'S" is left out, so the header fits the screen. */}
          <Logo compact className="sm:hidden" />
          <Logo className="hidden sm:inline-flex" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden min-w-0 text-right text-sm sm:block">
            <span className="block truncate font-bold">{admin.fullName}</span>
            <span className="block text-muted-foreground">{ROLE_LABELS[admin.role]}</span>
          </span>
          {/* "Security" (my authenticator devices) is for everyone who opens the admin area, staff too. */}
          <Link
            href="/admin/security"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label="Security: my authenticator devices"
          >
            <ShieldCheck aria-hidden="true" />
            <span className="hidden md:inline">Security</span>
          </Link>
          <ThemeToggle />
          {/* Same plain form POST as the public header: ends the session on the server, then loads the home page. */}
          <SignOutForm variant="button" />
        </div>
      </header>
      <div className="flex flex-1">
        <AdminNav role={admin.role} variant="sidebar" />
        {/* ONE page frame for every admin page: the same side padding (24 px, 32 px from 1280 px; 16 px on
            a phone) and the same max width (1760 px, centered). Pages never set their own width. The bottom
            padding keeps the last item above the phone bar (60 px bar + the device safe area). */}
        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-6 pb-[calc(60px+env(safe-area-inset-bottom)+24px)] sm:px-6 lg:pb-10 xl:px-8"
        >
          <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-6">{children}</div>
        </main>
      </div>
      <AdminNav role={admin.role} variant="bottom" />
    </div>
  );
}
