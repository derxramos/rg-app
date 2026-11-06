import type { Metadata } from "next";
import { Suspense } from "react";

import { FlowFrame, FlowSkeleton } from "@/components/request/flow-frame";
import { RequestForm } from "@/components/request/request-form";
import { EmptyState } from "@/components/shared/empty-state";
import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { getPublicSettings, listActiveServices } from "@/server/services/site-content";
import { Briefcase } from "lucide-react";

export const metadata: Metadata = {
  title: "Start a request",
  description: "Choose a service and tell us how to reach you. You get a tracking code right away.",
  robots: { index: false },
};

export default function RequestPage({ searchParams }: PageProps<"/request">) {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <RequestStep1 searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestStep1({
  searchParams,
}: {
  searchParams: PageProps<"/request">["searchParams"];
}) {
  const [{ service }, services, settings] = await Promise.all([
    searchParams,
    listActiveServices(),
    getPublicSettings(),
  ]);
  const selected = typeof service === "string" ? service : undefined;

  return (
    <FlowFrame
      step={1}
      title="Start a request"
      intro="Tell us what you need and how to reach you. It takes about two minutes."
    >
      {services.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No services listed yet"
          description="We cannot take new requests online yet. Please contact us."
        >
          <BackupContactBlock
            messengerUrl={settings.social_links.messenger}
            viberUrl={settings.social_links.viber}
          />
        </EmptyState>
      ) : (
        <RequestForm
          services={services.map((s) => ({ slug: s.slug, name: s.name }))}
          selectedSlug={services.some((s) => s.slug === selected) ? selected : undefined}
        />
      )}
    </FlowFrame>
  );
}
