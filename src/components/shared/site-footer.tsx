import Link from "next/link";

import { ContactButtons } from "@/components/shared/contact-buttons";
import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/shared/page-container";
import { BUSINESS_NAME, FOOTER_NAV, LEGAL_NAV } from "@/components/shared/site-nav";
import { safeContactUrl, viberDisplayNumber } from "@/lib/contact-links";
import { cn, focusRing } from "@/lib/utils";

type SiteFooterProps = {
  messengerUrl?: string | null;
  viberUrl?: string | null;
};

const headingClass = "mb-3 text-base font-bold";
const linkClass = cn(
  "flex min-h-11 items-center rounded-md text-base text-foreground underline-offset-4 hover:underline md:min-h-9",
  focusRing,
);

// Public footer: three equal columns from md, one column on phones.
// The contact links come from site settings; empty links are hidden.
export function SiteFooter({ messengerUrl, viberUrl }: SiteFooterProps) {
  const hasChannel = Boolean(safeContactUrl(messengerUrl) || viberDisplayNumber(viberUrl));

  return (
    <footer className="mt-auto border-t bg-surface-subtle">
      <PageContainer className="grid grid-cols-1 items-start gap-8 pt-10 md:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">{BUSINESS_NAME}</p>
          <p className="text-sm text-muted-foreground">
            You pay in your own GCash, Maya or bank app. You never pay on this website.
          </p>
        </div>

        <nav aria-label="Footer" className="flex min-w-0 flex-col">
          <h2 className={headingClass}>Pages</h2>
          {FOOTER_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col">
          <h2 className={headingClass}>Contact</h2>
          {hasChannel ? <p className="mb-3 text-base">Need help? Message us directly.</p> : null}
          <ContactButtons messengerUrl={messengerUrl} viberUrl={viberUrl} />
        </div>
      </PageContainer>

      <div className="mt-8 border-t">
        <PageContainer className="flex flex-col gap-1 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:gap-4">
          <p>© {BUSINESS_NAME}. All rights reserved.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5">
            {LEGAL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center rounded-md text-foreground underline-offset-4 hover:underline md:min-h-9",
                  focusRing,
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </PageContainer>
      </div>
    </footer>
  );
}
