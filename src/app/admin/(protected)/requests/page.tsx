import { Inbox, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminTitle, Pagination } from "@/components/admin/bits";
import { CardList, Clip, TableBox } from "@/components/admin/data-views";
import { FilterPanel } from "@/components/admin/filter-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentStateBadge } from "@/components/shared/payment-state-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
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
import { REQUEST_STATUSES, STATUS_LABELS, type RequestStatus } from "@/lib/status";
import { formatManilaDate } from "@/lib/time";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { listRequests } from "@/server/services/admin-requests";
import { listAllServices } from "@/server/services/admin-settings";

export const metadata: Metadata = { title: "Requests" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" && value ? value : undefined;

export default async function AdminRequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  await guardPanelPage("requests.view", "/admin/requests");
  const query = await searchParams;
  const status = one(query.status) as RequestStatus | undefined;
  const filters = {
    status: status && REQUEST_STATUSES.includes(status) ? status : undefined,
    serviceId: one(query.service),
    from: one(query.from),
    to: one(query.to),
    q: one(query.q),
    includeDrafts: one(query.drafts) === "1",
    page: Number(one(query.page)) || 1,
  };
  const db = getDb();
  const [{ rows, total, page, pageCount }, serviceList] = await Promise.all([
    listRequests(db, filters),
    listAllServices(db),
  ]);

  return (
    <>
      <AdminTitle
        title="Requests"
        intro={`${total} found. Drafts are hidden unless you tick the box.`}
      />

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 min-[1180px]:grid min-[1180px]:grid-cols-4"
        aria-label="Filters"
      >
        <FilterPanel
          activeCount={
            [filters.status, filters.serviceId, filters.from, filters.to].filter(Boolean).length +
            (filters.includeDrafts ? 1 : 0)
          }
          search={
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-q">Search</Label>
              <Input id="f-q" name="q" defaultValue={filters.q} placeholder="Code, name or email" />
            </div>
          }
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-status">Status</Label>
            <NativeSelect id="f-status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">All</option>
              {REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-service">Service</Label>
            <NativeSelect id="f-service" name="service" defaultValue={filters.serviceId ?? ""}>
              <option value="">All</option>
              {serviceList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-from">From</Label>
              <Input id="f-from" name="from" type="date" defaultValue={filters.from} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-to">To</Label>
              <Input id="f-to" name="to" type="date" defaultValue={filters.to} />
            </div>
          </div>
          <CheckboxRow htmlFor="f-drafts" className="min-[1180px]:col-span-2">
            <Checkbox
              id="f-drafts"
              name="drafts"
              value="1"
              defaultChecked={filters.includeDrafts}
            />
            <span>Show drafts</span>
          </CheckboxRow>
          <div className="min-[1180px]:col-span-2 min-[1180px]:justify-self-end">
            <Button type="submit">
              <Search aria-hidden="true" />
              Apply filters
            </Button>
          </div>
        </FilterPanel>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests found"
          description="Try a different search or clear the filters."
        />
      ) : (
        <>
          {/* Table from 1180 px. Cards below (see data-views.tsx). */}
          <TableBox>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">
                      <Link
                        href={`/admin/requests/${r.id}`}
                        className="font-bold text-primary underline underline-offset-4"
                      >
                        {r.trackingCode}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Clip text={r.clientFullName} />
                    </TableCell>
                    <TableCell>
                      <Clip text={r.serviceName} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>{formatManilaDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <PaymentStateBadge state={r.paymentState} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableBox>
          <CardList>
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/requests/${r.id}`}
                  className="flex min-h-11 flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="font-mono text-sm font-bold text-primary">{r.trackingCode}</span>
                  <span className="font-bold [overflow-wrap:anywhere]">{r.clientFullName}</span>
                  <span className="text-sm text-muted-foreground">
                    {r.serviceName} · {formatManilaDate(r.createdAt)}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <StatusBadge status={r.status} />
                    <PaymentStateBadge state={r.paymentState} />
                  </span>
                </Link>
              </li>
            ))}
          </CardList>
        </>
      )}
      <Pagination
        basePath="/admin/requests"
        params={{
          q: filters.q,
          status: filters.status,
          service: filters.serviceId,
          from: filters.from,
          to: filters.to,
          drafts: filters.includeDrafts ? "1" : undefined,
        }}
        page={page}
        pageCount={pageCount}
      />
    </>
  );
}
