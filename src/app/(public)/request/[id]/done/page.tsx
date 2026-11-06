import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { TrackingCode } from "@/components/shared/tracking-code";
import { WarningBox } from "@/components/shared/warning-box";
import { buttonVariants } from "@/components/ui/button";
import { DONE_COOKIE } from "@/server/auth/request-access";
import { getTokenSecret } from "@/server/env";
import { verifySigned } from "@/server/security/tokens";

export const metadata: Metadata = { title: "Request sent", robots: { index: false } };

export default function DonePage({ params }: PageProps<"/request/[id]/done">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <Done params={params} />
    </Suspense>
  );
}

async function Done({ params }: { params: PageProps<"/request/[id]/done">["params"] }) {
  const { id } = await params;
  // After sending, the draft cookie stops working. A short signed cookie lets us show the code once more.
  const signed = (await cookies()).get(DONE_COOKIE)?.value;
  const payload = signed ? verifySigned(getTokenSecret(), signed) : null;
  const [requestId, code] = payload ? payload.split("|") : [];
  if (!code || requestId !== id) redirect("/track");

  return (
    <FlowFrame step={5} title="Your request was sent" intro="Thank you. We will look at it soon.">
      <TrackingCode code={code} />
      <WarningBox variant="success" title="What happens next">
        We check your request. If we need something more, we tell you. To see where your request is,
        use your tracking code and the last 4 digits of your mobile number.
      </WarningBox>
      <div className="flex flex-wrap gap-3">
        <Link href="/track" className={buttonVariants({ size: "lg" })}>
          Track my request
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Back to the home page
        </Link>
      </div>
    </FlowFrame>
  );
}
