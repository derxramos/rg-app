import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Not allowed" };

// Shown to a logged-in person who is not an (active) admin and opens /admin.
// It is a plain page with no private data. The real check is requireAdmin() on every admin page and action.
export default function NotAllowedPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-primary-ink">Not allowed</h1>
      <p>
        This account cannot open the admin area. The admin area is only for the owner and staff.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/account" className={cn(buttonVariants({ variant: "default" }))}>
          Go to my requests
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to the home page
        </Link>
      </div>
    </div>
  );
}
