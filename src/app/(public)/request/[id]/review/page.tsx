import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { SubmitRequestButton } from "@/components/request/submit-form";
import { PaymentStateBadge } from "@/components/shared/payment-state-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { guardRequestPage } from "@/server/auth/request-page-guard";
import { getDb } from "@/server/db/client";
import { listFiles } from "@/server/services/files";
import { listPaymentsForRequest } from "@/server/services/payments";
import { formatPesos } from "@/lib/money";
import { getRequestWithService } from "@/server/services/requests";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Review and send", robots: { index: false } };

export default function ReviewPage({ params }: PageProps<"/request/[id]/review">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <Review params={params} />
    </Suspense>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-base break-words">{value}</dd>
    </div>
  );
}

async function Review({ params }: { params: PageProps<"/request/[id]/review">["params"] }) {
  const { id } = await params;
  await guardRequestPage(id, "submit");
  const db = getDb();
  const [request, files, paid] = await Promise.all([
    getRequestWithService(db, id),
    listFiles(db, id),
    listPaymentsForRequest(db, id),
  ]);
  if (!request) notFound();

  return (
    <FlowFrame
      step={5}
      title="Check and send"
      intro="Please check your details. Then send your request."
    >
      <Card>
        <CardHeader>
          <CardTitle>Your request</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            <Row label="Service" value={request.serviceName} />
            <Row label="Name" value={request.clientFullName} />
            <Row label="Email" value={request.clientEmail} />
            <Row label="Mobile number" value={request.clientPhone} />
            {request.businessName ? <Row label="Business" value={request.businessName} /> : null}
            {request.clientMessage ? <Row label="Message" value={request.clientMessage} /> : null}
            <Row
              label="Documents"
              value={
                files.length === 0
                  ? "None yet. We will ask you if we need some."
                  : `${files.length} file${files.length === 1 ? "" : "s"}`
              }
            />
            <Row
              label="Payment"
              value={
                paid.length === 0 ? (
                  <PaymentStateBadge state="not_paid" />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {paid.map((p) => (
                      <li key={p.id} className="flex flex-col gap-1">
                        <span>
                          {formatPesos(p.amountCentavos)} by{" "}
                          {(p.methodSnapshot as { name?: string }).name ?? "payment"}, reference{" "}
                          {p.referenceNumber}
                        </span>
                        <PaymentStateBadge state="pending" />
                      </li>
                    ))}
                  </ul>
                )
              }
            />
          </dl>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitRequestButton requestId={id} />
        <Link
          href={`/request/${id}/documents`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>
    </FlowFrame>
  );
}
