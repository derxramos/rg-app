import { History, Search } from "lucide-react";
import type { Metadata } from "next";

import { ActivityCleanup } from "@/components/admin/activity-cleanup";
import { AdminTitle, Pagination } from "@/components/admin/bits";
import { CardList, TableBox } from "@/components/admin/data-views";
import { FilterPanel } from "@/components/admin/filter-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { formatManilaDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import {
  PURGE_CHOICES_DAYS,
  countActivityOlderThan,
  listActivity,
} from "@/server/services/admin-overview";
import { listPanelPeople } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Activity log" };

const GROUPS = [
  ["", "All actions"],
  ["payment_method", "Payment methods"],
  ["payment.", "Payments checked"],
  ["request.", "Requests"],
  ["file.", "Files opened"],
  ["settings", "Settings"],
  ["service", "Services"],
  ["admin.", "Admin users"],
  ["login", "Logins"],
  ["export", "Exports"],
];
const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

type Row = Awaited<ReturnType<typeof listActivity>>["rows"][number];

const who = (r: Row) =>
  `${r.actorName ?? (r.actorType === "system" ? "System" : "Unknown")}${
    r.entityId ? ` · ${r.entityType} ${r.entityId.slice(0, 8)}` : ""
  }`;

// The saved details of one entry, closed until you ask for them.
function Details({ details }: { details: unknown }) {
  if (!details || Object.keys(details as object).length === 0)
    return <span aria-hidden="true">–</span>;
  return (
    <details className="text-sm">
      <summary className="min-h-6 cursor-pointer font-bold">Details</summary>
      <pre className="mt-1 max-w-xl overflow-x-auto rounded-md bg-background p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">
        {JSON.stringify(details, null, 2)}
      </pre>
    </details>
  );
}

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  const me = await guardPanelPage("activity.view", "/admin/activity");
  const canPurge = can(me.role, "activity.purge");
  const q = await searchParams;
  const filters = {
    action: one(q.action),
    actorId: one(q.admin),
    from: one(q.from),
    to: one(q.to),
    page: Number(one(q.page)) || 1,
  };
  const db = getDb();
  const [{ rows, total, page, pageCount }, admins] = await Promise.all([
    listActivity(db, filters),
    listPanelPeople(db),
  ]);
  // How many entries each clean-up choice would remove (only owner and admin see the clean-up).
  const counts: Record<number, number> = {};
  if (canPurge)
    for (const days of PURGE_CHOICES_DAYS) counts[days] = await countActivityOlderThan(db, days);

  return (
    <>
      <AdminTitle
        title="Activity log"
        intro={`${total} entries, 20 per page. Nobody can change them. Entries older than 1 year are removed automatically every day.`}
        actions={canPurge ? <ActivityCleanup counts={counts} /> : undefined}
      />
      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 min-[1180px]:grid min-[1180px]:grid-cols-4"
        aria-label="Filters"
      >
        <FilterPanel
          activeCount={
            [filters.action, filters.actorId, filters.from, filters.to].filter(Boolean).length
          }
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="a-action">What</Label>
            <NativeSelect id="a-action" name="action" defaultValue={filters.action ?? ""}>
              {GROUPS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="a-admin">Who</Label>
            <NativeSelect id="a-admin" name="admin" defaultValue={filters.actorId ?? ""}>
              <option value="">Everyone</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3 min-[1180px]:col-span-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="a-from">From</Label>
              <Input id="a-from" name="from" type="date" defaultValue={filters.from} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="a-to">To</Label>
              <Input id="a-to" name="to" type="date" defaultValue={filters.to} />
            </div>
          </div>
          <div>
            <Button type="submit">
              <Search aria-hidden="true" />
              Apply filters
            </Button>
          </div>
        </FilterPanel>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={History} title="Nothing found" />
      ) : (
        <>
          <CardList aria-label="Activity">
            {rows.map((r) => {
              const hot = r.action.startsWith("payment_method");
              return (
                <li
                  key={r.id}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-4",
                    hot ? "border-warning bg-warning-soft text-warning-ink" : "bg-card",
                  )}
                >
                  <span className="font-mono text-sm font-bold [overflow-wrap:anywhere]">
                    {r.action}
                  </span>
                  <span className="text-sm">{formatManilaDateTime(r.createdAt)}</span>
                  <span className="text-sm [overflow-wrap:anywhere]">{who(r)}</span>
                  <Details details={r.details} />
                </li>
              );
            })}
          </CardList>
          <TableBox>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">When</TableHead>
                  <TableHead scope="col">Action</TableHead>
                  <TableHead scope="col">Who</TableHead>
                  <TableHead scope="col">Item</TableHead>
                  <TableHead scope="col">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className={
                      r.action.startsWith("payment_method") ? "bg-warning-soft" : undefined
                    }
                  >
                    <TableCell className="align-top">{formatManilaDateTime(r.createdAt)}</TableCell>
                    <TableCell className="align-top font-mono text-sm font-bold">
                      {r.action}
                    </TableCell>
                    <TableCell className="align-top">
                      {r.actorName ?? (r.actorType === "system" ? "System" : "Unknown")}
                    </TableCell>
                    <TableCell className="align-top">
                      {r.entityId ? `${r.entityType} ${r.entityId.slice(0, 8)}` : "–"}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <Details details={r.details} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableBox>
        </>
      )}
      <Pagination
        basePath="/admin/activity"
        params={{
          action: filters.action,
          admin: filters.actorId,
          from: filters.from,
          to: filters.to,
        }}
        page={page}
        pageCount={pageCount}
      />
    </>
  );
}
