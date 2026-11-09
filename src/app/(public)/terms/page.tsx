import { CalendarDays, Tag } from "lucide-react";
import type { Metadata } from "next";

import { Markdown } from "@/components/shared/markdown";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { Badge } from "@/components/ui/badge";
import { fillLegalText } from "@/lib/legal-text";
import { formatManilaDate } from "@/lib/time";
import { getPublicLegal, getPublicSettings } from "@/server/services/site-content";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using this website to request services, send documents and pay.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const [settings, legal] = await Promise.all([getPublicSettings(), getPublicLegal("terms")]);
  const text = fillLegalText("terms", legal.body, {
    retentionDays: settings.file_retention_days,
    contactEmail: settings.contact.email,
    contactPhone: settings.contact.phone,
  });
  return (
    <>
      <PageHeading title="Terms of service">
        <div className="flex flex-wrap gap-3">
          <Badge variant="primary">
            <Tag aria-hidden="true" />
            Version {legal.version}
          </Badge>
          <Badge variant="neutral">
            <CalendarDays aria-hidden="true" />
            Date: {formatManilaDate(legal.createdAt)}
          </Badge>
        </div>
      </PageHeading>
      <PageContainer className="py-10 md:py-14">
        <Markdown>{text}</Markdown>
      </PageContainer>
    </>
  );
}
