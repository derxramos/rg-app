import type { Metadata } from "next";

import { TrackForm } from "@/components/request/track-form";
import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { getPublicSettings } from "@/server/services/site-content";

export const metadata: Metadata = {
  title: "Track my request",
  description:
    "See where your request is. You need your tracking code and the last 4 digits of your mobile number.",
  robots: { index: false },
};

export default async function TrackPage() {
  const { social_links } = await getPublicSettings();
  return (
    <>
      <PageHeading
        title="Track my request"
        intro="Enter your tracking code and the last 4 digits of your mobile number."
      />
      <PageContainer className="flex max-w-[640px] flex-col gap-8 py-10 md:py-14">
        <TrackForm />
        <BackupContactBlock messengerUrl={social_links.messenger} viberUrl={social_links.viber} />
      </PageContainer>
    </>
  );
}
