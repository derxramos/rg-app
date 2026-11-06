import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/shared/page-container";
import { cn, focusRing } from "@/lib/utils";

// Shown for a moment while the real header (which needs the current address) is loading.
// It has the same height (64 px), so the page does not jump.
export function SiteHeaderFallback() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <PageContainer className="flex h-16 items-center">
        <Link
          href="/"
          aria-label="RG'S Bookkeeping & Accounting, home"
          className={cn("rounded-md", focusRing)}
        >
          <Logo />
        </Link>
      </PageContainer>
    </header>
  );
}
