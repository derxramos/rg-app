import { Suspense } from "react";

import { BackupLinksProvider } from "@/components/shared/backup-contact-context";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { SiteHeaderFallback } from "@/components/shared/site-header-fallback";
import { getPublicSettings } from "@/server/services/site-content";

// Header + page + footer for every public page (and the 404 page).
// The contact links come from site settings. Empty links are hidden by the contact block.
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const settings = await getPublicSettings();
  const links = {
    messengerUrl: settings.social_links.messenger || null,
    viberUrl: settings.social_links.viber || null,
  };

  return (
    <BackupLinksProvider links={links}>
      {/* The header reads the current address to mark the active link, so it waits inside Suspense. */}
      <Suspense fallback={<SiteHeaderFallback />}>
        <SiteHeader />
      </Suspense>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter {...links} />
    </BackupLinksProvider>
  );
}
