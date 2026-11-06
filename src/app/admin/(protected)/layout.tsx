import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { TwoFactorProvider } from "@/components/admin/two-factor-context";
import { WarningBox } from "@/components/shared/warning-box";
import { guardAdminPage } from "@/server/auth/admin";
import { isTwoFactorRequired } from "@/server/auth/admin-core";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false },
};

// The page check. Every page below also calls requireAdmin() in its own actions and routes.
async function Frame({ children }: { children: React.ReactNode }) {
  const admin = await guardAdminPage();
  const required = isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA);
  return (
    <TwoFactorProvider value={required}>
      <AdminShell admin={admin}>
        {required ? null : (
          <WarningBox variant="warning" title="2FA is switched off">
            Admins sign in with a password only. Turn 2FA on before many people use this site (see
            docs/SETUP_GUIDE.md, section &ldquo;Turn 2FA on later&rdquo;).
          </WarningBox>
        )}
        {children}
      </AdminShell>
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
