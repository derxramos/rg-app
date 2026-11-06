import type { Metadata } from "next";

import { ServicesGrid } from "@/components/public/services-grid";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { listActiveServices } from "@/server/services/site-content";

export const metadata: Metadata = {
  title: "Services",
  description:
    "See the bookkeeping and accounting services we offer, and what to prepare for each one.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const services = await listActiveServices();

  return (
    <>
      <PageHeading
        title="Our services"
        intro="Choose a service to see what you need to prepare. Then start your request online."
      />
      <PageContainer className="py-10 md:py-14">
        <ServicesGrid services={services} headingTag="h2" />
      </PageContainer>
    </>
  );
}
