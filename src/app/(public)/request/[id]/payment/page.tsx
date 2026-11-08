import { ArrowLeft, ArrowRight, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { CopyButton } from "@/components/shared/copy-button";
import { EmptyState } from "@/components/shared/empty-state";
import { WarningBox } from "@/components/shared/warning-box";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFee } from "@/lib/money";
import { qrImageUrl } from "@/lib/qr-url";
import { cn } from "@/lib/utils";
import { flowMode } from "@/server/auth/request-access-core";
import { guardRequestAccess } from "@/server/auth/request-page-guard";
import { getDb } from "@/server/db/client";
import { listPaymentMethodsForService } from "@/server/services/payments";
import { getRequestWithService } from "@/server/services/requests";
import { getPublicSettings } from "@/server/services/site-content";

export const metadata: Metadata = { title: "Pay with a QR code", robots: { index: false } };

export default function PaymentPage({ params }: PageProps<"/request/[id]/payment">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <Payment params={params} />
    </Suspense>
  );
}

async function Payment({ params }: { params: PageProps<"/request/[id]/payment">["params"] }) {
  const { id } = await params;
  const access = await guardRequestAccess(id, "pay");
  const mode = flowMode(access);
  const fromTracking = mode.afterSend;
  const db = getDb();
  const [methods, settings, summary] = await Promise.all([
    listPaymentMethodsForService(db, access.request.serviceId),
    getPublicSettings(),
    getRequestWithService(db, id),
  ]);

  return (
    <FlowFrame
      step={fromTracking ? undefined : 3}
      requestId={fromTracking ? undefined : id}
      title="Pay with a QR code"
      intro="Scan a QR code in your own GCash, Maya or bank app. You pay in your app, not on this website. You can also pay later."
    >
      {summary ? (
        <section
          aria-label="What you are paying for"
          className="flex flex-col gap-3 rounded-lg border bg-surface-subtle p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-muted-foreground">Service</span>
            <span className="text-lg font-bold break-words">{summary.serviceName}</span>
          </div>
          <div className="flex flex-col gap-1 sm:text-right">
            <span className="text-sm text-muted-foreground">Service fee</span>
            <span className="text-2xl font-bold">
              {summary.feeCentavos === null
                ? "Fee will be confirmed"
                : formatFee(summary.feeCentavos)}
            </span>
          </div>
        </section>
      ) : null}
      {methods.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Please contact us to pay"
          description="We cannot show payment details right now."
        >
          <BackupContactBlock
            messengerUrl={settings.social_links.messenger}
            viberUrl={settings.social_links.viber}
          />
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-6">
          {methods.map((method) => {
            const qr = qrImageUrl(method.qrImagePath);
            return (
              <li key={method.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{method.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="gap-5">
                    {qr ? (
                      <div className="flex flex-col items-start gap-3">
                        <Image
                          src={qr}
                          alt={`${method.name} QR code`}
                          width={192}
                          height={240}
                          unoptimized
                          // 2 x 2 inches (192 px) on a computer. Smaller on a phone, but not below 1.5 inches (144 px), so it stays easy to scan.
                          className="h-auto w-36 rounded-md border bg-white sm:w-48"
                        />
                        <a
                          href={qr}
                          download
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                        >
                          Save QR image
                        </a>
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Account name</span>
                      <span className="text-2xl font-bold break-words">{method.accountName}</span>
                    </div>
                    <WarningBox variant="warning" title="Check the name before you pay">
                      Check that the account name is{" "}
                      <strong className="font-bold">{method.accountName}</strong> before you pay.
                    </WarningBox>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm text-muted-foreground">Account number</span>
                        <span className="font-mono text-lg font-bold break-all">
                          {method.accountNumber}
                        </span>
                      </div>
                      <CopyButton value={method.accountNumber} label="Copy number" />
                    </div>
                    {method.instructions ? (
                      <p className="text-base whitespace-pre-line">{method.instructions}</p>
                    ) : null}
                    <div>
                      <Link
                        href={`/request/${id}/receipt?method=${method.id}`}
                        className={buttonVariants({ size: "lg" })}
                      >
                        I paid. Add my receipt
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col items-start gap-2 border-t pt-6">
        <Link
          href={fromTracking ? mode.backHref : `/request/${id}/review`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          {fromTracking ? "Back to my request" : "Skip for now. I will pay later"}
        </Link>
        <p className="text-sm text-muted-foreground">
          You can pay later from the tracking page, with your tracking code, or at our office.
        </p>
        {fromTracking ? null : (
          <Link
            href={`/request/${id}/documents`}
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
          >
            <ArrowLeft aria-hidden="true" />
            Back to documents
          </Link>
        )}
      </div>
    </FlowFrame>
  );
}
