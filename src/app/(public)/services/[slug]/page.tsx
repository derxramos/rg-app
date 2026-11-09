import { ArrowRight, FileQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { EmptyState } from "@/components/shared/empty-state";
import { Markdown } from "@/components/shared/markdown";
import { JsonLd } from "@/components/shared/json-ld";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { WarningBox } from "@/components/shared/warning-box";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatFee } from "@/lib/money";
import { breadcrumbJsonLd, serviceJsonLd, trimDescription } from "@/lib/seo";
import { getBaseUrl } from "@/lib/site-url";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getActiveService,
  getPublicSettings,
  listActiveServices,
} from "@/server/services/site-content";

// Builds the page for every active service ahead of time. Then the title and description are in the
// HTML head from the start (good for search engines), and the page is served very fast.
// Next.js needs at least one value, so when there are no services yet we give it a placeholder.
// The placeholder shows the "not found" page. New services added later are built on the first visit.
export async function generateStaticParams() {
  const services = await listActiveServices();
  return services.length > 0
    ? services.map((service) => ({ slug: service.slug }))
    : [{ slug: "no-services-yet" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const service = await getActiveService(slug);
  if (!service) return { title: "Service not found", robots: { index: false } };
  const description = trimDescription(
    service.shortDescription ||
      `${service.name}: what to prepare and how to send your request online.`,
  );
  const path = `/services/${service.slug}`;
  return {
    title: service.name,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, title: service.name, description },
    twitter: { card: "summary_large_image", title: service.name, description },
  };
}

// The address part (slug) is only known when a visitor asks for the page, so it is read inside Suspense.
export default function ServiceDetailPage({ params }: PageProps<"/services/[slug]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ServiceDetail params={params} />
    </Suspense>
  );
}

async function ServiceDetail({ params }: { params: PageProps<"/services/[slug]">["params"] }) {
  const { slug } = await params;
  const [service, settings] = await Promise.all([getActiveService(slug), getPublicSettings()]);
  if (!service) notFound();

  const base = getBaseUrl();
  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd(base, {
            slug: service.slug,
            name: service.name,
            description: trimDescription(service.shortDescription || service.name, 300),
            feeCentavos: service.feeCentavos,
          }),
          breadcrumbJsonLd(base, [
            { name: "Home", path: "/" },
            { name: "Services", path: "/services" },
            { name: service.name, path: `/services/${service.slug}` },
          ]),
        ]}
      />
      <PageHeading title={service.name} intro={service.shortDescription || undefined} />
      <PageContainer className="grid grid-cols-1 gap-10 py-10 md:py-14 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-2">
          {service.description ? <Markdown>{service.description}</Markdown> : null}

          <section aria-labelledby="requirements-title" className="flex flex-col gap-4">
            <h2 id="requirements-title" className="text-xl font-bold">
              What to prepare
            </h2>
            {service.requirements.length === 0 ? (
              <EmptyState
                icon={FileQuestion}
                title="Please contact us for the list of requirements."
                description="We will tell you which documents you need for this service."
              >
                <BackupContactBlock
                  messengerUrl={settings.social_links.messenger}
                  viberUrl={settings.social_links.viber}
                />
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {service.requirements.map((requirement) => (
                  <li
                    key={requirement.id}
                    className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-4 [overflow-wrap:anywhere]"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-base font-bold">{requirement.label}</span>
                      <Badge variant={requirement.isRequired ? "primary" : "neutral"}>
                        {requirement.isRequired ? "Required" : "Optional"}
                      </Badge>
                    </div>
                    {requirement.details ? (
                      <p className="text-base text-muted-foreground">{requirement.details}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <WarningBox variant="info" title="Rules and fees can change">
            Government rules and fees may change. We will confirm the latest requirements and any
            fees with you before we start.
          </WarningBox>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
            <span className="text-sm text-muted-foreground">Service fee</span>
            <span className="text-2xl font-bold">
              {service.feeCentavos === null
                ? "Fee will be confirmed"
                : formatFee(service.feeCentavos)}
            </span>
            <span className="text-sm text-muted-foreground">
              Our service fee only. Government fees are not included.
            </span>
          </div>
          <h2 className="text-xl font-bold">Ready to start?</h2>
          <p className="text-base text-muted-foreground">
            Send your details and documents online. You do not need to pay to start.
          </p>
          <Link
            href={`/request?service=${encodeURIComponent(service.slug)}`}
            className={buttonVariants({ variant: "accent", size: "lg" })}
          >
            Start a request for this service
            <ArrowRight aria-hidden="true" />
          </Link>
        </aside>
      </PageContainer>
    </>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="border-b bg-surface-subtle">
        <PageContainer className="flex flex-col gap-3 py-8 md:py-12">
          <Skeleton className="h-8 w-2/3 max-w-sm" />
          <Skeleton className="h-6 w-full max-w-prose" />
        </PageContainer>
      </div>
      <PageContainer className="flex flex-col gap-4 py-10 md:py-14">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-16 w-full max-w-2xl rounded-lg" />
        <Skeleton className="h-16 w-full max-w-2xl rounded-lg" />
      </PageContainer>
    </>
  );
}
