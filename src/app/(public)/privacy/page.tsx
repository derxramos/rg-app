import { CalendarDays, Tag } from "lucide-react";
import type { Metadata } from "next";

import { Markdown } from "@/components/shared/markdown";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { WarningBox } from "@/components/shared/warning-box";
import { Badge } from "@/components/ui/badge";
import { PRIVACY_NOTICE_DATE, buildPrivacyNotice } from "@/content/privacy-notice";
import { formatManilaDate } from "@/lib/time";
import { getPublicSettings } from "@/server/services/site-content";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "How we collect, use, keep and protect your personal information, and how to ask us about it.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const settings = await getPublicSettings();
  const version = settings.privacy_notice_version;
  const isDraft = /draft/i.test(version);

  const text = buildPrivacyNotice({
    retentionDays: settings.file_retention_days,
    contactEmail: settings.contact.email,
    contactPhone: settings.contact.phone,
  });

  return (
    <>
      <PageHeading title="Privacy notice">
        <div className="flex flex-wrap gap-3">
          <Badge variant="primary">
            <Tag aria-hidden="true" />
            Version {version}
          </Badge>
          <Badge variant="neutral">
            <CalendarDays aria-hidden="true" />
            Date: {formatManilaDate(`${PRIVACY_NOTICE_DATE}T00:00:00+08:00`)}
          </Badge>
        </div>
      </PageHeading>
      <PageContainer className="flex flex-col gap-6 py-10 md:py-14">
        {isDraft ? (
          <WarningBox variant="warning" title="Draft text" className="max-w-prose">
            This notice is a draft. The owner must check it before the website is used by real
            clients. Parts in [square brackets] are still missing.
          </WarningBox>
        ) : null}
        <Markdown>{text}</Markdown>
      </PageContainer>
    </>
  );
}
