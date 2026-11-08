import type { Metadata } from "next";
import { Suspense } from "react";

import { MfaSetup } from "@/components/admin/mfa-setup";
import { Skeleton } from "@/components/ui/skeleton";
import { guardMfaSetupPage } from "@/server/auth/panel";

export const metadata: Metadata = { title: "Set up 2FA" };

export default function AdminMfaSetupPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <Setup />
    </Suspense>
  );
}

// Only for staff, admin and owner accounts, and only while 2-step login is required and a device is missing.
async function Setup() {
  const { verifiedCount } = await guardMfaSetupPage();
  return <MfaSetup verifiedCount={verifiedCount} />;
}
