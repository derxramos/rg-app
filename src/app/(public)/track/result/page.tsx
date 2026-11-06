import { ArrowRight, Paperclip, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FlowSkeleton } from "@/components/request/flow-frame";
import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { StatusBadge } from "@/components/shared/status-badge";
import { WarningBox } from "@/components/shared/warning-box";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatManilaDateTime } from "@/lib/time";
import { STATUS_LABELS } from "@/lib/status";
import { getTrackingRequestId, requireRequestAccess } from "@/server/auth/request-access";
import { AccessError } from "@/server/auth/request-access-core";
import { getDb } from "@/server/db/client";
import { getPublicSettings } from "@/server/services/site-content";
import { getTrackingView } from "@/server/services/tracking";

export const metadata: Metadata = { title: "Your request", robots: { index: false } };

const PAYMENT_TEXT = {
  none: "No payment yet.",
  pending: "Payment received. We are checking it.",
  verified: "Payment verified. Thank you.",
  rejected: "We could not confirm your payment. Please read our message above.",
} as const;

export default function TrackResultPage() {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <Result />
    </Suspense>
  );
}

async function Result() {
  const requestId = await getTrackingRequestId();
  let view = null;
  if (requestId) {
    try {
      await requireRequestAccess(requestId, "view");
      view = await getTrackingView(getDb(), requestId);
    } catch (error) {
      if (!(error instanceof AccessError)) throw error;
    }
  }
  if (!requestId || !view) redirect("/track");
  const settings = await getPublicSettings();

  return (
    <>
      <PageHeading title="Your request" intro={view.serviceName}>
        <div>
          <StatusBadge status={view.status} />
        </div>
      </PageHeading>
      <PageContainer className="flex max-w-[640px] flex-col gap-6 py-10 md:py-14">
        {view.message ? (
          <div className="flex flex-col gap-1 rounded-lg border border-info bg-info-soft p-4 text-info-ink">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Send aria-hidden="true" className="size-4" />
              Message from us
            </span>
            <span className="text-base whitespace-pre-line">{view.message}</span>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base">{PAYMENT_TEXT[view.payment]}</p>
          </CardContent>
        </Card>

        {view.canPay || view.canUploadMore ? (
          <div className="flex flex-wrap gap-3">
            {view.canPay ? (
              <Link
                href={`/request/${requestId}/payment`}
                className={buttonVariants({ size: "lg" })}
              >
                Pay now
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
            {view.canUploadMore ? (
              <Link
                href={`/request/${requestId}/documents`}
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
            <CardTitle>What happened</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-4">
              {view.timeline.map((event, index) => (
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
          </CardContent>
        </Card>

        <WarningBox variant="info" title="Your documents are private">
          This page never shows your documents or your contact details. To keep your information
          safe, this page closes by itself after 1 hour. You can open it again with your code.
        </WarningBox>
        <BackupContactBlock
          messengerUrl={settings.social_links.messenger}
          viberUrl={settings.social_links.viber}
        />
      </PageContainer>
    </>
  );
}
