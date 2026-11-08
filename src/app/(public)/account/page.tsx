import { isPanelRole } from "@/lib/permissions";
import { ArrowRight, Download, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { updateProfileAction } from "@/app/(public)/account/actions";
import { AutoRefresh } from "@/components/account/auto-refresh";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { AuthForm } from "@/components/auth/auth-form";
import { FlowSkeleton } from "@/components/request/flow-frame";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { ReloadOnRestore } from "@/components/shared/reload-on-restore";
import { StatusBadge } from "@/components/shared/status-badge";
import { WarningBox } from "@/components/shared/warning-box";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatManilaDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { guardUserPage, withUserRls } from "@/server/auth/session";
import { listMyRequests } from "@/server/services/account";

export const metadata: Metadata = { title: "My requests", robots: { index: false } };

export default function AccountPage() {
  return (
    <>
      <PageHeading
        title="My requests"
        intro="See where each request is. This page updates by itself every minute."
      />
      <PageContainer className="flex max-w-[800px] flex-col gap-10 py-10 md:py-14">
        <Suspense fallback={<FlowSkeleton />}>
          <AccountBody />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function AccountBody() {
  const { session, profile } = await guardUserPage({ path: "/account" });
  // Read through Row Level Security: the database itself only returns this user's rows.
  const rows = await withUserRls(session, (tx) => listMyRequests(tx, profile.id));

  return (
    <>
      <ReloadOnRestore />
      <AutoRefresh />

      <section aria-labelledby="requests-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="requests-title" className="text-xl font-bold text-primary-ink">
            Your requests
          </h2>
          <Link href="/request" className={buttonVariants({ variant: "accent", size: "sm" })}>
            Start a request
          </Link>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="You have no requests yet"
            description="When you send a request, it shows here with its status."
          >
            <Link href="/request" className={buttonVariants({ variant: "accent" })}>
              Start a request
            </Link>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/account/requests/${row.id}`}
                  className="flex min-h-11 flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-base font-bold">{row.serviceName}</span>
                    <span className="font-mono text-sm text-muted-foreground">
                      {row.trackingCode} · {formatManilaDate(row.submittedAt ?? row.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={row.status} />
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="details-title" className="flex flex-col gap-4">
        <h2 id="details-title" className="text-xl font-bold text-primary-ink">
          My details
        </h2>
        <p className="text-base">
          Email: <strong>{profile.email || session.email}</strong>. To change your email, please
          contact us.
        </p>
        <AuthForm
          action={updateProfileAction}
          submitLabel="Save my details"
          fields={[
            {
              name: "fullName",
              label: "Full name",
              autoComplete: "name",
              defaultValue: profile.fullName,
            },
            {
              name: "phone",
              label: "Mobile number (optional)",
              type: "tel",
              inputMode: "tel",
              autoComplete: "tel-national",
              defaultValue: profile.phone?.replace(/^\+63/, "") ?? "",
              optional: true,
            },
          ]}
        />
      </section>

      <section aria-labelledby="privacy-title" className="flex flex-col gap-4">
        <h2 id="privacy-title" className="text-xl font-bold text-primary-ink">
          My data and privacy
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Download my data</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-base">
              Get a file with your details and your requests. It does not include the documents you
              sent, only their names.
            </p>
            {/* A plain form post: the download starts from a button, never from a link. */}
            <form method="post" action="/api/account/export">
              <Button type="submit" variant="outline">
                <Download aria-hidden="true" />
                Download my data
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className={cn("border-danger")}>
          <CardHeader>
            <CardTitle>Delete my account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <WarningBox variant="danger" title="This cannot be undone">
              We delete your documents and your personal details, and remove your login. We keep a
              short record of the request (the code, the service, the dates and the payment values)
              for our business accounts. You cannot delete your account while you have an open
              request.
            </WarningBox>
            {isPanelRole(profile.role) ? (
              <p className="text-base">
                An account with access to the admin area cannot be deleted here.
              </p>
            ) : (
              <DeleteAccountForm />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
