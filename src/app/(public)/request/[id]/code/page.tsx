import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { TrackingCode } from "@/components/shared/tracking-code";
import { WarningBox } from "@/components/shared/warning-box";
import { buttonVariants } from "@/components/ui/button";
import { guardRequestPage } from "@/server/auth/request-page-guard";

export const metadata: Metadata = { title: "Your tracking code", robots: { index: false } };

export default function CodePage({ params }: PageProps<"/request/[id]/code">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <Code params={params} />
    </Suspense>
  );
}

async function Code({ params }: { params: PageProps<"/request/[id]/code">["params"] }) {
  const { id } = await params;
  const request = await guardRequestPage(id, "view");

  return (
    <FlowFrame
      step={1}
      title="Your request is started"
      intro="Save your tracking code now. You need it, and the last 4 digits of your mobile number, to check your request."
    >
      <TrackingCode code={request.trackingCode} />
      <WarningBox variant="info" title="Save this code">
        Take a screenshot or write it down. We cannot show it to you again on this device after you
        send your request.
      </WarningBox>
      <div>
        <Link href={`/request/${id}/documents`} className={buttonVariants({ size: "lg" })}>
          Continue to documents
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </FlowFrame>
  );
}
