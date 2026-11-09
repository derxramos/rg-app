import type { Metadata } from "next";

import { AdminTitle } from "@/components/admin/bits";
import { HelpBrowser } from "@/components/admin/help-browser";
import { helpGroupsFor } from "@/lib/help-content";
import { guardPanelPage } from "@/server/auth/panel";

export const metadata: Metadata = { title: "Help" };

// Every person who can open the admin area may read Help. Parts that belong to screens they cannot use are
// left out, so staff do not read about Settings pages they never see. "?topic=" opens one group first: F1 sets
// it from the page the person was on.
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const admin = await guardPanelPage("requests.view", "/admin/help");
  const { topic } = await searchParams;

  return (
    <>
      <AdminTitle
        title="Help"
        intro="What each screen and status means, with an example. Press F1 on any admin page to open the help for that page."
      />
      <HelpBrowser groups={helpGroupsFor(admin.role)} initialTopic={topic ?? null} />
    </>
  );
}
