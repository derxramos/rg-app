import { History, Search } from "lucide-react";
import type { Metadata } from "next";

import { AdminTitle, Pagination } from "@/components/admin/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { formatManilaDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { listActivity } from "@/server/services/admin-overview";
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

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await guardPanelPage("activity.view", "/admin/activity");
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

  return (
    <>
      <AdminTitle
        title="Activity log"
        intro={`${total} entries. Nobody can change or delete them.`}
      />
      <form
        method="get"
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Filters"
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
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
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
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={History} title="Nothing found" />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const hot = r.action.startsWith("payment_method");
            return (
              <li
                key={r.id}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3",
                  hot ? "border-warning bg-warning-soft text-warning-ink" : "bg-card",
                )}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold break-all">{r.action}</span>
                  <span className="text-sm">{formatManilaDateTime(r.createdAt)}</span>
                </span>
                <span className="text-sm">
                  {r.actorName ?? (r.actorType === "system" ? "System" : "Unknown")}
                  {r.entityId ? ` · ${r.entityType} ${r.entityId.slice(0, 8)}` : ""}
                </span>
                {r.details && Object.keys(r.details as object).length > 0 ? (
                  <details className="text-sm">
                    <summary className="min-h-6 cursor-pointer font-bold">Details</summary>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-background p-2 text-xs whitespace-pre-wrap break-all text-foreground">
                      {JSON.stringify(r.details, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
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
