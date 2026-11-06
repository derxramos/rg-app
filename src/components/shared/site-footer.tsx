import Link from "next/link";

import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/shared/page-container";
import { BUSINESS_NAME, FOOTER_NAV } from "@/components/shared/site-nav";
import { cn, focusRing } from "@/lib/utils";

type SiteFooterProps = {
  messengerUrl?: string | null;
  viberUrl?: string | null;
};

// Public footer. The contact links come from site settings; empty links are hidden.
export function SiteFooter({ messengerUrl, viberUrl }: SiteFooterProps) {
  return (
    <footer className="mt-auto border-t bg-surface-subtle">
      <PageContainer className="grid gap-8 py-10 md:grid-cols-3">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">{BUSINESS_NAME}</p>
          <p className="text-sm text-muted-foreground">
            You pay in your own GCash, Maya or bank app. You never pay on this website.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-col">
          <p className="mb-1 text-base font-bold">Pages</p>
          {FOOTER_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 items-center rounded-md text-base text-foreground underline-offset-4 hover:underline",
                focusRing,
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <BackupContactBlock messengerUrl={messengerUrl} viberUrl={viberUrl} />
      </PageContainer>
    </footer>
  );
}
