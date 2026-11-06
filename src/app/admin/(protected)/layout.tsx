import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { guardAdminPage } from "@/server/auth/admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false },
};

// The page check. Every page below also calls requireAdmin() in its own actions and routes.
async function Frame({ children }: { children: React.ReactNode }) {
  const admin = await guardAdminPage();
  return <AdminShell admin={admin}>{children}</AdminShell>;
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
