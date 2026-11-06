import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { PageContainer } from "@/components/shared/page-container";
import { PublicShell } from "@/components/shared/public-shell";
import { buttonVariants } from "@/components/ui/button";
import { getPublicSettings } from "@/server/services/site-content";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

// Shown for unknown addresses and for notFound() (for example an unknown service).
// It builds its own header and footer, because it replaces the public layout.
export default async function NotFound() {
  const { social_links } = await getPublicSettings();

  return (
    <PublicShell>
      <PageContainer className="flex flex-col items-start gap-5 py-14 md:py-20">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
          <SearchX aria-hidden="true" className="size-7" />
        </span>
        <h1 className="text-2xl font-bold md:text-3xl">We could not find that page</h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          The address may be wrong, or the page may have moved. You can go back to the home page or
          look at our services.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className={buttonVariants()}>
            Go to the home page
          </Link>
          <Link href="/services" className={buttonVariants({ variant: "outline" })}>
            See our services
          </Link>
        </div>
        <BackupContactBlock
          messengerUrl={social_links.messenger}
          viberUrl={social_links.viber}
          className="mt-4"
        />
      </PageContainer>
    </PublicShell>
  );
}
