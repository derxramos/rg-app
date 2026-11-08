import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Not allowed" };

// Shown to a logged-in person who may not open a page in the admin area. It is a plain page with no private data.
// The real check is requirePanel() on every admin page, action and route (and the database).
//   ?reason=role  = a staff account opened an address that is not for staff. The try is in the activity log.
//   no reason     = the account is not an (active) staff, admin or owner account.
// The address part (?reason=) is read at request time, so it sits in its own Suspense block.
export default function NotAllowedPage({ searchParams }: PageProps<"/admin/not-allowed">) {
  return (
    <Suspense fallback={<h1 className="text-2xl font-bold text-primary-ink">Not allowed</h1>}>
      <NotAllowedContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NotAllowedContent({
  searchParams,
}: {
  searchParams: PageProps<"/admin/not-allowed">["searchParams"];
}) {
  const { reason } = await searchParams;
  const staffTried = reason === "role";
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-primary-ink">Not allowed</h1>
      {staffTried ? (
        <p>
          Your account is not allowed to open that page. This try was written to the activity log.
          If you think this is a mistake, please ask the owner.
        </p>
      ) : (
        <p>
          This account cannot open the admin area. The admin area is only for the owner, the admin
          and staff.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        {staffTried ? (
          <Link href="/admin/requests" className={cn(buttonVariants({ variant: "default" }))}>
            Go to Requests
          </Link>
        ) : (
          <Link href="/account" className={cn(buttonVariants({ variant: "default" }))}>
            Go to my requests
          </Link>
        )}
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to the home page
        </Link>
      </div>
    </div>
  );
}
