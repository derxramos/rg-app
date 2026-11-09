import { AlertTriangle, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminTitle, StatCard } from "@/components/admin/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { WarningBox } from "@/components/shared/warning-box";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatManilaDateTime } from "@/lib/time";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { getDashboard } from "@/server/services/admin-overview";

export const metadata: Metadata = { title: "Dashboard" };

const COUNTED = [
  "submitted",
  "under_review",
  "waiting_for_client",
  "payment_submitted",
  "in_progress",
] as const;
// Status words are explained on the Help page (F1), not under the cards, so every card looks the same.
const mb =(bytes: number) => Math.round(bytes / 1024 / 1024);

export default async function AdminDashboardPage() {
  const admin = await guardPanelPage("dashboard.view", "/admin");
  const d = await getDashboard(getDb());

  return (
    <>
      <AdminTitle
        title={`Hello, ${admin.fullName.split(" ")[0]}`}
        intro="What needs your attention today."
      />

      {/* The grid follows the width of THIS area (a container query), not the screen, so the sidebar cannot
          squeeze the cards. 2 columns up to 640 px, 3 columns up to 1100 px, 5 columns only when every card
          is at least 210 px wide (5 x 210 + 4 x 12 = 1098). Never 4 + 1. */}
      <section aria-label="Requests by status" className="@container">
        <div className="grid grid-cols-2 gap-3 @[640px]:grid-cols-3 @[1100px]:grid-cols-5">
          {COUNTED.map((status) => (
            <StatCard
              key={status}
              label=""
              value={d.byStatus[status] ?? 0}
              href={`/admin/requests?status=${status}`}
            >
              <StatusBadge status={status} />
            </StatCard>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Needs action</CardTitle>
          </CardHeader>
          <CardContent>
            {d.needsAction.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nothing waiting"
                description="New requests and payments will show here."
              />
            ) : (
              <ul className="flex flex-col divide-y">
                {d.needsAction.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/requests/${r.id}?from=dashboard`}
                      className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-3 hover:bg-surface-subtle"
                    >
                      <span className="min-w-0">
                        <span className="block font-bold break-words">{r.clientFullName}</span>
                        <span className="block text-sm text-muted-foreground">
                          {r.serviceName} · {formatManilaDateTime(r.createdAt)}
                        </span>
                      </span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>File storage</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress
                value={d.storage.percent}
                tone={d.storage.tone}
                aria-label={`Storage used, ${Math.round(d.storage.percent)} percent`}
              />
              <p className="text-base">
                {mb(d.storage.usedBytes)} MB of {mb(d.storage.limitBytes)} MB (
                {Math.round(d.storage.percent)}%)
              </p>
              {d.storage.tone !== "default" ? (
                <p className="flex items-center gap-2 text-sm font-bold text-warning-ink">
                  <AlertTriangle aria-hidden="true" className="size-4" />
                  {d.storage.tone === "danger"
                    ? "Almost full. New uploads stop at 95%."
                    : "Getting full."}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Emails and jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base">
                Emails sent today:{" "}
                <strong className="font-bold">
                  {d.emails.sentToday} / {d.emails.limit}
                </strong>
              </p>
              <p
                className={
                  d.jobs.cleanupStale ? "text-base font-bold text-warning-ink" : "text-base"
                }
              >
                Last cleanup:{" "}
                {d.jobs.lastCleanup ? formatManilaDateTime(d.jobs.lastCleanup) : "never"}
                {d.jobs.cleanupStale ? " (check the job)" : ""}
              </p>
              <p
                className={
                  d.jobs.keepAliveStale ? "text-base font-bold text-warning-ink" : "text-base"
                }
              >
                Last keep-alive:{" "}
                {d.jobs.lastKeepAlive ? formatManilaDateTime(d.jobs.lastKeepAlive) : "never"}
                {d.jobs.keepAliveStale ? " (check the job)" : ""}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payment methods</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base">
                {d.lastMethodChange
                  ? `Last changed ${formatManilaDateTime(d.lastMethodChange.createdAt)}${d.lastMethodChange.name ? ` by ${d.lastMethodChange.name}` : ""}`
                  : "Never changed."}
              </p>
            </CardContent>
          </Card>
          <WarningBox variant="info" title="Back up your data">
            Export a backup every week. The free database plan has no automatic backups. See the
            Export page.
          </WarningBox>
        </div>
      </div>
    </>
  );
}
