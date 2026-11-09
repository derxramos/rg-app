import type { Metadata } from "next";

import { AdminTitle } from "@/components/admin/bits";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HELP_SECTIONS, STATUS_HELP, STATUS_ORDER, type HelpItem } from "@/lib/help-content";
import { can } from "@/lib/permissions";
import { guardPanelPage } from "@/server/auth/panel";

export const metadata: Metadata = { title: "Help" };

function HelpEntry({ item, badge }: { item: HelpItem; badge?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="flex flex-wrap items-center gap-2 text-base font-bold">
        {badge ?? item.name}
      </h3>
      <p className="text-base">
        <span className="font-bold">What it is: </span>
        {item.what}
      </p>
      {item.todo ? (
        <p className="text-base">
          <span className="font-bold">What to do: </span>
          {item.todo}
        </p>
      ) : null}
      <p className="text-base text-muted-foreground">
        <span className="font-bold">Example: </span>
        {item.example}
      </p>
    </div>
  );
}

// Every person who can open the admin area may read Help. The sections that belong to settings they cannot
// use are left out, so staff do not read about screens they never see.
export default async function HelpPage() {
  const admin = await guardPanelPage("requests.view", "/admin/help");
  const sections = HELP_SECTIONS.filter((s) => can(admin.role, s.action));

  return (
    <>
      <AdminTitle
        title="Help"
        intro="What each screen and status means, with an example. Press F1 on any admin page to open this page."
      />

      <nav aria-label="Help sections" className="flex flex-wrap gap-2 text-base">
        <a className="underline" href="#statuses">
          Request statuses
        </a>
        {sections.map((s) => (
          <a key={s.id} className="underline" href={`#${s.id}`}>
            {s.title}
          </a>
        ))}
      </nav>

      <Card id="statuses" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Request statuses</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-base text-muted-foreground">
            A request usually goes: Submitted, Under review, Payment submitted, Payment verified, In
            progress, Completed. On hold can happen in between when the client must reply.
          </p>
          {STATUS_ORDER.map((status) => (
            <HelpEntry
              key={status}
              item={STATUS_HELP[status]}
              badge={<StatusBadge status={status} />}
            />
          ))}
        </CardContent>
      </Card>

      {sections.map((s) => (
        <Card key={s.id} id={s.id} className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{s.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {s.items.map((item) => (
              <HelpEntry key={item.name} item={item} />
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
