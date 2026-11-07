import { Suspense } from "react";

import { BackupLinksProvider } from "@/components/shared/backup-contact-context";
import { HeaderAuth, HeaderAuthFallback } from "@/components/shared/header-auth";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { SiteHeaderFallback } from "@/components/shared/site-header-fallback";
import { SignedOutNotice } from "@/components/shared/signed-out-notice";
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
        {/* Each auth slot waits in its own Suspense: the login is read at request time, never cached. */}
        <SiteHeader
          authBar={
            <Suspense fallback={<HeaderAuthFallback layout="bar" />}>
              <HeaderAuth layout="bar" />
            </Suspense>
          }
          authMenu={
            <Suspense fallback={<HeaderAuthFallback layout="menu" />}>
              <HeaderAuth layout="menu" />
            </Suspense>
          }
        />
      </Suspense>
      <SignedOutNotice />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </BackupLinksProvider>
  );
}
