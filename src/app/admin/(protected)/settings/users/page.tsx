import { Check, ChevronLeft, ChevronRight, Users, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AccountRowActions } from "@/components/admin/accounts-row-actions";
import { AccountsToolbar } from "@/components/admin/accounts-toolbar";
import { AdminTitle } from "@/components/admin/bits";
import { InviteAccount } from "@/components/admin/invite-account";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatManilaDate } from "@/lib/time";
import {
  STATUS_LABELS,
  accountQueryString,
  parseAccountQuery,
  type AccountStatus,
} from "@/lib/validation/accounts";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { listAccounts, type AccountRow } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Admin users" };

const STATUS_VARIANT: Record<AccountStatus, "success" | "neutral" | "warning" | "info"> = {
  active: "success",
  turned_off: "neutral",
  invited: "info",
  unverified: "warning",
};

// 2-step login: On or Off for staff, admin and owner. A client has none ("–").
function TwoFactor({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-muted-foreground">–</span>;
  return value ? (
    <Badge variant="success">
      <Check aria-hidden="true" />
      On
    </Badge>
  ) : (
    <Badge variant="warning">
      <X aria-hidden="true" />
      Off
    </Badge>
  );
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/settings/users">) {
  const me = await guardPanelPage("accounts.view", "/admin/settings/users");
  const query = parseAccountQuery(await searchParams);
  const { rows, total, page, perPage } = await listAccounts(getDb(), query);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const viewer = { id: me.id, role: me.role };

  const actionsFor = (row: AccountRow) => (
    <AccountRowActions
      viewer={viewer}
      account={{
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        role: row.role,
        isActive: row.isActive,
        status: row.status,
      }}
    />
  );
  const joined = (row: AccountRow) => formatManilaDate(row.createdAt);
  const link = (target: number) =>
    `/admin/settings/users${accountQueryString({ ...query, page: target })}`;

  return (
    <>
      <AdminTitle
        title="Admin users"
        intro="Each change requires your 6-digit authenticator code. No accounts will be deleted."
        actions={<InviteAccount viewerRole={me.role} />}
      />
      <AccountsToolbar query={query} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No accounts found"
          description="Change the search or the filters."
        />
      ) : (
        <>
          {/* Phones: one card per account. */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label="Accounts">
            {rows.map((row) => (
              <li key={row.id}>
                <Card className="gap-3 p-4 md:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold break-words">{row.fullName || "(no name)"}</p>
                      <p className="text-sm break-all text-muted-foreground">{row.email}</p>
                    </div>
                    {actionsFor(row)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">{ROLE_LABELS[row.role]}</Badge>
                    <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">2-step login</dt>
                      <dd>
                        <TwoFactor value={row.twoFactor} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Joined</dt>
                      <dd>{joined(row)}</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>

          {/* From 768 px: a table. */}
          <div className="hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="text-center">
                    Name
                  </TableHead>
                  <TableHead scope="col" className="text-center">
                    Email
                  </TableHead>
                  <TableHead scope="col" className="text-center">
                    Role
                  </TableHead>
                  <TableHead scope="col" className="text-center">
                    Status
                  </TableHead>
                  <TableHead scope="col" className="text-center">
                    2-step login
                  </TableHead>
                  <TableHead scope="col" className="text-center">
                    Joined
                  </TableHead>
                  <TableHead scope="col" className="text-center">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-bold">{row.fullName || "(no name)"}</TableCell>
                    <TableCell className="break-all">{row.email}</TableCell>
                    <TableCell>
                      <Badge variant="primary">{ROLE_LABELS[row.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>
                        {STATUS_LABELS[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TwoFactor value={row.twoFactor} />
                    </TableCell>
                    <TableCell>{joined(row)}</TableCell>
                    <TableCell className="text-right">{actionsFor(row)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <nav
        aria-label="Pages"
        className="flex flex-wrap items-center justify-between gap-3 text-base"
      >
        <p>
          {total} {total === 1 ? "account" : "accounts"}. Page {page} of {pageCount}.
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={link(page - 1)} className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden="true" />
              Previous
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link href={link(page + 1)} className={buttonVariants({ variant: "outline" })}>
              Next
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </nav>
    </>
  );
}
