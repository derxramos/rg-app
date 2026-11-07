import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/shared/page-container";
import { BUSINESS_NAME, LEGAL_NAV } from "@/components/shared/site-nav";
import { cn, focusRing } from "@/lib/utils";

const linkClass = cn(
  "flex min-h-11 items-center rounded-md text-sm whitespace-nowrap text-foreground underline-offset-4 hover:underline sm:min-h-9",
  focusRing,
);

// Public footer, in the same container as the header and the page content.
//   Row 1: the logo on the left, "Privacy notice" and "Terms of service" on the right (24 px apart, centered with the logo).
//   Row 2: the copyright line, starting exactly under the logo.
// On phones (under 640 px) it is one left aligned column: logo, the two links in one row (they wrap if needed), copyright.
// The page links are not repeated here: the sticky header has them. Contact buttons are in the "Questions?" section.
export function SiteFooter() {
  return (
    <footer className="mt-auto bg-surface-subtle">
      <PageContainer className="flex flex-col gap-3 py-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <Logo />
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6">
            {LEGAL_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-xs text-muted-foreground">© {BUSINESS_NAME}. All rights reserved.</p>
      </PageContainer>
    </footer>
  );
}
