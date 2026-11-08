import type { Metadata } from "next";
import { Suspense } from "react";

import { MfaSetup } from "@/components/admin/mfa-setup";
import { Skeleton } from "@/components/ui/skeleton";
import { guardMfaPage } from "@/server/auth/panel";

export const metadata: Metadata = { title: "Set up 2FA" };

export default function AdminMfaSetupPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <Setup />
    </Suspense>
  );
}

// Only for admins, and only while 2FA is required.
async function Setup() {
  await guardMfaPage();
  return <MfaSetup />;
}
