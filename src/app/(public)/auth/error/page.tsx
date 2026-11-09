import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "This link did not work", robots: { index: false } };

// Shown when an email link (verify email, reset password) is old, used already, or wrong.
export default function AuthErrorPage() {
  return (
    <>
      <PageHeading
        title="This link did not work"
        intro="It may be too old, or you may have used it already."
      />
      <PageContainer className="flex max-w-[560px] flex-col gap-4 py-10 md:py-14">
        <p className="text-base">You can ask for a new link:</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link href="/forgot-password" className={cn(buttonVariants({ variant: "default" }))}>
            I forgot my password
          </Link>
          <Link href="/register/check-email" className={cn(buttonVariants({ variant: "outline" }))}>
            Send the verify link again
          </Link>
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }))}>
            Sign in
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
