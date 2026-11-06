import type { Metadata } from "next";
import { Suspense } from "react";

import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { ReceiptForm } from "@/components/request/receipt-form";
import { addDaysToIsoDate, todayInManila } from "@/lib/time";
import { MAX_PAYMENT_AGE_DAYS } from "@/lib/validation/payment";
import { guardRequestAccess } from "@/server/auth/request-page-guard";
import { getDb } from "@/server/db/client";
import { listActivePaymentMethods } from "@/server/services/payments";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Your receipt", robots: { index: false } };

export default function ReceiptPage({ params, searchParams }: PageProps<"/request/[id]/receipt">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <Receipt params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Receipt({
  params,
  searchParams,
}: {
  params: PageProps<"/request/[id]/receipt">["params"];
  searchParams: PageProps<"/request/[id]/receipt">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { via } = await guardRequestAccess(id, "pay");
  const methods = await listActivePaymentMethods(getDb());
  if (methods.length === 0) redirect(`/request/${id}/payment`);

  const today = todayInManila();
  const chosen = typeof query.method === "string" ? query.method : undefined;

  return (
    <FlowFrame
      step={via === "tracking" ? undefined : 4}
      wide
      title="Your receipt"
      intro="Choose your receipt screenshot. We can read it for you, or you can type the values. The picture stays on your phone. We never upload it."
    >
      <ReceiptForm
        requestId={id}
        methods={methods.map((m) => ({ id: m.id, name: m.name, parserKey: m.parserKey }))}
        initialMethodId={methods.some((m) => m.id === chosen) ? chosen! : methods[0].id}
        maxDate={today}
        minDate={addDaysToIsoDate(today, -MAX_PAYMENT_AGE_DAYS)}
      />
    </FlowFrame>
  );
}
