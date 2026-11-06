import { ArrowRight, Wallet } from "lucide-react";
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
import { qrImageUrl } from "@/lib/qr-url";
import { cn } from "@/lib/utils";
import { guardRequestPage } from "@/server/auth/request-page-guard";
import { getDb } from "@/server/db/client";
import { listActivePaymentMethods } from "@/server/services/payments";
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
  await guardRequestPage(id, "pay");
  const [methods, settings] = await Promise.all([
    listActivePaymentMethods(getDb()),
    getPublicSettings(),
  ]);

  return (
    <FlowFrame
      step={3}
      title="Pay with a QR code"
      intro="Scan a QR code in your own GCash, Maya or bank app. You pay in your app, not on this website. You can also pay later."
    >
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
                          width={260}
                          height={320}
                          unoptimized
                          className="h-auto w-full max-w-[260px] rounded-md border bg-white"
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
          href={`/request/${id}/review`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Skip for now. I will pay later
        </Link>
        <p className="text-sm text-muted-foreground">
          You can pay later from the tracking page, with your tracking code.
        </p>
      </div>
    </FlowFrame>
  );
}
