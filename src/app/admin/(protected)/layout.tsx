import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { TwoFactorProvider } from "@/components/admin/two-factor-context";
import { TwoFactorOffBanner } from "@/components/admin/two-factor-off-banner";
import { getStepUpMode, guardPanelPage } from "@/server/auth/panel";
import { isTwoFactorRequired } from "@/server/auth/panel-core";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false },
};

// The page check. Every page below also calls requirePanel() in its own actions and routes.
async function Frame({ children }: { children: React.ReactNode }) {
  const admin = await guardPanelPage();
  const required = isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA);
  const mode = await getStepUpMode();
  return (
    <TwoFactorProvider value={{ required, mode }}>
      {required ? null : <TwoFactorOffBanner />}
      <AdminShell admin={admin}>{children}</AdminShell>
    </TwoFactorProvider>
  );
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Loading" className="p-6">
          <Skeleton className="h-10 w-1/2" />
        </div>
      }
    >
      <Frame>{children}</Frame>
    </Suspense>
  );
}
