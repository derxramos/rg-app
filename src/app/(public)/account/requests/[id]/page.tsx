import { ArrowRight, Paperclip, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/account/auto-refresh";
import { FlowSkeleton } from "@/components/request/flow-frame";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { PaymentStateBadge } from "@/components/shared/payment-state-badge";
import { ReloadOnRestore } from "@/components/shared/reload-on-restore";
import { StatusBadge } from "@/components/shared/status-badge";
import { TrackingCode } from "@/components/shared/tracking-code";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPesos } from "@/lib/money";
import { STATUS_LABELS } from "@/lib/status";
import { formatManilaDate, formatManilaDateTime } from "@/lib/time";
import { guardUserPage, withUserRls } from "@/server/auth/session";
import { getMyRequest } from "@/server/services/account";

export const metadata: Metadata = { title: "Your request", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AccountRequestPage({ params }: PageProps<"/account/requests/[id]">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <RequestDetail params={params} />
    </Suspense>
  );
}

async function RequestDetail({
  params,
}: {
  params: PageProps<"/account/requests/[id]">["params"];
}) {
  const { id } = await params;
  const { session, profile } = await guardUserPage({ path: `/account/requests/${id}` });
  // Not a real id, a missing request and somebody else's request all give the same "not found" page.
  if (!UUID.test(id)) notFound();
  const request = await withUserRls(session, (tx) => getMyRequest(tx, profile.id, id));
  if (!request) notFound();

  const paymentState = request.payments.some((p) => p.status === "verified")
    ? "verified"
    : request.payments.some((p) => p.status === "pending")
      ? "pending"
      : request.payments.some((p) => p.status === "rejected")
        ? "rejected"
        : "not_paid";

  return (
    <>
      <ReloadOnRestore />
      <AutoRefresh />
      <PageHeading title="Your request" intro={request.serviceName}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={request.status} />
          <Link href="/account" className="text-base font-bold underline">
            Back to My Requests
          </Link>
        </div>
      </PageHeading>
      <PageContainer className="flex max-w-[720px] flex-col gap-6 py-10 md:py-14">
        <TrackingCode code={request.trackingCode} />

        {request.message ? (
          <div className="flex flex-col gap-1 rounded-lg border border-info bg-info-soft p-4 text-info-ink">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Send aria-hidden="true" className="size-4" />
              Message from us
            </span>
            <span className="text-base whitespace-pre-line">{request.message}</span>
          </div>
        ) : null}

        {request.status === "draft" ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/request/${request.id}/documents`}
              className={buttonVariants({ size: "lg" })}
            >
              Continue this request
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        ) : request.canPay || request.canUploadMore ? (
          <div className="flex flex-wrap gap-3">
            {request.canPay ? (
              <Link
                href={`/request/${request.id}/payment`}
                className={buttonVariants({ size: "lg" })}
              >
                Pay now
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
            {request.canUploadMore ? (
              <Link
                href={`/request/${request.id}/documents`}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <Paperclip aria-hidden="true" />
                Upload more documents
              </Link>
            ) : null}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <PaymentStateBadge state={paymentState} />
            </div>
            {request.payments.length > 0 ? (
              <ul className="flex flex-col gap-2 text-base">
                {request.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-col gap-1">
                    <span>
                      {formatPesos(payment.amountCentavos)} paid on{" "}
                      {formatManilaDate(payment.paidOn)}
                    </span>
                    {payment.status === "rejected" && payment.rejectionReason ? (
                      <span className="text-sm text-muted-foreground">
                        We could not confirm it: {payment.rejectionReason}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base">No payment yet.</p>
            )}
            <p className="text-sm text-muted-foreground">
              For an official receipt copy, please send us a message using the Contact page.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What happened</CardTitle>
          </CardHeader>
          <CardContent>
            {request.timeline.length === 0 ? (
              <p className="text-base">Not sent yet. Your request is a draft.</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {request.timeline.map((event, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-3 shrink-0 rounded-full bg-primary"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-base font-bold">{STATUS_LABELS[event.status]}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatManilaDateTime(event.at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {request.messages.length > 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>Earlier messages from us</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-4">
                {request.messages.slice(1).map((message, index) => (
                  <li key={index} className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">
                      {formatManilaDateTime(message.at)}
                    </span>
                    <span className="text-base whitespace-pre-line">{message.body}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Documents you sent</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {request.files.length === 0 ? (
              <p className="text-base">No documents yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-base">
                {request.files.map((file) => (
                  <li key={file.id} className="flex flex-col gap-0.5">
                    <span className="font-bold break-all">{file.name}</span>
                    <span className="text-sm text-muted-foreground">
                      Sent {formatManilaDate(file.uploadedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted-foreground">
              For your safety, documents cannot be opened or downloaded from this page.
            </p>
          </CardContent>
        </Card>
      </PageContainer>
    </>
  );
}
