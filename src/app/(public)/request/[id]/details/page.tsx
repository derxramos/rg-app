import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EditDetailsForm } from "@/components/request/edit-details-form";
import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { guardRequestPage } from "@/server/auth/request-page-guard";
import { getDb } from "@/server/db/client";
import { getRequestWithService } from "@/server/services/requests";

export const metadata: Metadata = { title: "Your details", robots: { index: false } };

export default function DetailsPage({ params }: PageProps<"/request/[id]/details">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <Details params={params} />
    </Suspense>
  );
}

async function Details({ params }: { params: PageProps<"/request/[id]/details">["params"] }) {
  const { id } = await params;
  // Only a draft can be changed ("submit" is allowed for drafts only).
  await guardRequestPage(id, "submit");
  const request = await getRequestWithService(getDb(), id);
  if (!request) notFound();

  return (
    <FlowFrame
      step={1}
      title="Your details"
      intro="Change your name, mobile number or message here. Your tracking code stays the same."
    >
      <EditDetailsForm
        requestId={id}
        serviceName={request.serviceName}
        email={request.clientEmail}
        initial={{
          fullName: request.clientFullName,
          phone: request.clientPhone.replace(/^\+63/, ""),
          businessName: request.businessName ?? "",
          message: request.clientMessage ?? "",
        }}
      />
    </FlowFrame>
  );
}
