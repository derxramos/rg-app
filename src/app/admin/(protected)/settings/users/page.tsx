import type { Metadata } from "next";

import { AdminTitle } from "@/components/admin/bits";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatManilaDateTime } from "@/lib/time";
import { STATUS_LABELS, parseAccountQuery } from "@/lib/validation/accounts";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { listAccounts } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Admin users" };

// First version (phase 2): a plain list. The full table, filters, dialogs and menus come in phase 4.
export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/settings/users">) {
  await guardPanelPage("accounts.view", "/admin/settings/users");
  const query = parseAccountQuery(await searchParams);
  const { rows, total } = await listAccounts(getDb(), query);
  return (
    <>
      <AdminTitle title="Admin users" intro={`${total} accounts.`} />
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3"
          >
            <span className="font-bold">{row.fullName || row.email}</span>
            <span className="text-sm text-muted-foreground">{row.email}</span>
            <Badge>{ROLE_LABELS[row.role]}</Badge>
            <Badge>{STATUS_LABELS[row.status]}</Badge>
            <span className="text-sm text-muted-foreground">
              {formatManilaDateTime(row.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
