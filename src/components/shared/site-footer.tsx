import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/shared/page-container";
import { BUSINESS_NAME, FOOTER_NAV, LEGAL_NAV } from "@/components/shared/site-nav";
import { cn, focusRing } from "@/lib/utils";

const headingClass = "mb-3 text-base font-bold";
const linkClass = cn(
  "whitespace-nowrap",
  "flex min-h-11 items-center rounded-md text-base text-foreground underline-offset-4 hover:underline md:min-h-9",
  focusRing,
);

// Public footer: two equal columns from md (business info, pages), one column on phones.
// Contact buttons are not repeated here: the "Questions?" section and the Contact page have them.
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-surface-subtle">
      <PageContainer className="grid grid-cols-1 items-start gap-8 pt-10 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">{BUSINESS_NAME}</p>
        </div>

        <nav aria-label="Footer" className="min-w-0 xl:justify-self-end">
          <h2 className={headingClass}>Pages</h2>
          {/* One per line on phones, 2 by 2 on tablets. On wide screens one row with equal gaps, pushed to the right, so the last link ("Track my request") ends at the same right edge as the legal links below. */}
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2 xl:flex xl:justify-end xl:gap-x-6">
            {FOOTER_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
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
