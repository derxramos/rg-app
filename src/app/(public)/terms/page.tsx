import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import { Markdown } from "@/components/shared/markdown";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { Badge } from "@/components/ui/badge";
import { TERMS_DATE, buildTerms } from "@/content/terms";
import { formatManilaDate } from "@/lib/time";
import { getPublicSettings } from "@/server/services/site-content";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using this website to request services, send documents and pay.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const { contact } = await getPublicSettings();
  const text = buildTerms({ contactEmail: contact.email, contactPhone: contact.phone });
  return (
    <>
      <PageHeading title="Terms of service">
        <div>
          <Badge variant="neutral">
            <CalendarDays aria-hidden="true" />
            Date: {formatManilaDate(`${TERMS_DATE}T00:00:00+08:00`)}
          </Badge>
        </div>
      </PageHeading>
      <PageContainer className="py-10 md:py-14">
        <Markdown>{text}</Markdown>
      </PageContainer>
    </>
  );
}
