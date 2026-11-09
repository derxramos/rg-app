import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminShellSkeleton } from "@/components/admin/admin-shell-skeleton";

// Development only: shows the admin loading frame so it can be checked by eye. Blocked in production.
export const metadata: Metadata = {
  title: "Loading check (development only)",
  robots: { index: false, follow: false },
};

export default function LoadingPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShellSkeleton />;
}
