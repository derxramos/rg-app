"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { useBackupLinks } from "@/components/shared/backup-contact-context";
import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { PageContainer } from "@/components/shared/page-container";
import { Button, buttonVariants } from "@/components/ui/button";

// The "something went wrong" screen. It always offers the Messenger and Viber links
// (when the owner has set them), so a client can still reach the business.
export function ErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const links = useBackupLinks();

  useEffect(() => {
    // The details stay in the browser console and the server log. The visitor sees a short message.
    console.error(error);
  }, [error]);

  return (
    <PageContainer className="flex flex-col items-start gap-5 py-14 md:py-20">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
        <TriangleAlert aria-hidden="true" className="size-7" />
      </span>
      <h1 className="text-2xl font-bold md:text-3xl">Something went wrong</h1>
      <p className="max-w-prose text-lg text-muted-foreground">
        We are sorry. The page could not be shown. Please try again. If it keeps happening, write to
        us and we will help you.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go to the home page
        </Link>
      </div>
      <BackupContactBlock {...links} className="mt-4" />
    </PageContainer>
  );
}
