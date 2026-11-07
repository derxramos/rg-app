import { ArrowRight, ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HeroArt } from "@/components/public/hero-art";
import { ServicesGrid } from "@/components/public/services-grid";
import { StepsList } from "@/components/public/steps-list";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { JsonLd } from "@/components/shared/json-ld";
import { PageContainer } from "@/components/shared/page-container";
import { buttonVariants } from "@/components/ui/button";
import { contactChannelSentence, safeContactUrl, viberDisplayNumber } from "@/lib/contact-links";
import { businessJsonLd, websiteJsonLd } from "@/lib/seo";
import { getBaseUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import { getPublicSettings, listActiveServices } from "@/server/services/site-content";

export const metadata: Metadata = {
  // The home page uses the default title from the root layout.
  alternates: { canonical: "/" },
};

// Used only when the owner has not written an intro in the admin area yet.
const DEFAULT_INTRO =
  "Send your request and documents online, pay in your own GCash, Maya or bank app, and follow your request with a tracking code.";

export default async function HomePage() {
  const [settings, services] = await Promise.all([getPublicSettings(), listActiveServices()]);
  const { headline, intro } = settings.home_texts;
  // The sentence names only the channels that have a saved link.
  const channelSentence = contactChannelSentence({
    messenger: safeContactUrl(settings.social_links.messenger) !== null,
    viber: viberDisplayNumber(settings.social_links.viber) !== null,
  });

  const base = getBaseUrl();
  const sameAs = [settings.social_links.messenger]
    .map((url) => (typeof url === "string" ? url : ""))
    .filter((url) => url.startsWith("https://"));

  return (
    <>
      <JsonLd
        data={[
          websiteJsonLd(base),
          businessJsonLd(base, {
            phone: settings.contact.phone,
            email: settings.contact.email,
            address: settings.contact.address,
            sameAs,
          }),
        ]}
      />
      <section className="overflow-hidden border-b bg-surface-subtle">
        <PageContainer className="grid gap-10 py-12 md:py-16 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col items-start gap-5">
            <h1 className="text-3xl font-bold text-primary-ink lg:text-4xl">
              {headline || "RG'S Bookkeeping and Accounting Services"}
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">{intro || DEFAULT_INTRO}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/request" className={buttonVariants({ variant: "accent", size: "lg" })}>
                Start a request
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/track" className={buttonVariants({ variant: "outline", size: "lg" })}>
                <ClipboardList aria-hidden="true" />
                Track my request
              </Link>
            </div>
          </div>
          <HeroArt />
        </PageContainer>
      </section>

      <section aria-labelledby="home-services">
        <PageContainer className="flex flex-col gap-6 py-10 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="home-services" className="text-2xl font-bold">
              Our services
            </h2>
            {services.length > 0 ? (
              <Link
                href="/services"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-primary")}
              >
                See all services
              </Link>
            ) : null}
          </div>
          <ServicesGrid services={services.slice(0, 6)} />
        </PageContainer>
      </section>

      {/* The line ABOVE this section stays. The line below it was removed: the next section has a different background instead. */}
      <section aria-labelledby="home-how" className="border-t bg-surface-subtle">
        <PageContainer className="flex flex-col gap-6 py-10 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="home-how" className="text-2xl font-bold">
              How it works
            </h2>
            <Link
              href="/how-it-works"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-primary")}
            >
              Read the steps
            </Link>
          </div>
          <StepsList compact />
        </PageContainer>
      </section>

      <section aria-labelledby="home-contact">
        <PageContainer className="flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between md:gap-10 md:py-14">
          <div className="flex min-w-0 flex-col gap-2 md:max-w-prose md:flex-1">
            <h2 id="home-contact" className="text-2xl font-bold">
              Questions?
            </h2>
            <p className="text-base text-muted-foreground">
              Send us a message and we will reply.
              {channelSentence ? ` ${channelSentence}` : ""}
            </p>
          </div>
          <ContactButtons
            messengerUrl={settings.social_links.messenger}
            viberUrl={settings.social_links.viber}
            className="md:shrink-0 md:flex-nowrap md:justify-end"
          />
        </PageContainer>
      </section>
    </>
  );
}
