import type { Metadata } from "next";
import Link from "next/link";

import { StepsList } from "@/components/public/steps-list";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { WarningBox } from "@/components/shared/warning-box";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Send a request, upload your documents, pay by QR code in your own app, and track your request online.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHeading title="How it works" intro="Five simple steps, from your phone or computer." />
      <PageContainer className="flex flex-col gap-8 py-10 md:py-14">
        <StepsList headingTag="h2" />
        <WarningBox variant="warning" title="You pay in your own app" className="max-w-3xl">
          Payment is made in your own GCash, Maya or bank app. This website never takes your money
          and never asks for your bank password or PIN.
        </WarningBox>
        <div>
          <Link href="/request" className={buttonVariants({ variant: "accent", size: "lg" })}>
            Start a request
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
