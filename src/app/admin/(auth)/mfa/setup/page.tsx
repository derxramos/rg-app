import type { Metadata } from "next";

import { MfaSetup } from "@/components/admin/mfa-setup";

export const metadata: Metadata = { title: "Set up 2FA" };

export default function AdminMfaSetupPage() {
  return <MfaSetup />;
}
