import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { resetPasswordAction } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { FlowSkeleton } from "@/components/request/flow-frame";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { WarningBox } from "@/components/shared/warning-box";
import { PASSWORD_MIN } from "@/lib/validation/auth";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <>
      <PageHeading title="Choose a new password" />
      <PageContainer className="flex max-w-[560px] flex-col gap-6 py-10 md:py-14">
        <Suspense fallback={<FlowSkeleton />}>
          <ResetBody />
        </Suspense>
      </PageContainer>
    </>
  );
}

// The email link signs the person in for a short time (/auth/confirm). Without that, there is nothing to reset.
async function ResetBody() {
  const session = await getSession();
  if (!session) {
    return (
      <WarningBox variant="warning" title="This link has ended">
        The link is old or was already used.{" "}
        <Link href="/forgot-password" className="font-bold underline">
          Ask for a new link
        </Link>
        .
      </WarningBox>
    );
  }
  return (
    <AuthForm
      action={resetPasswordAction}
      submitLabel="Save the new password"
      fields={[
        {
          name: "password",
          label: "New password",
          type: "password",
          autoComplete: "new-password",
          hint: `At least ${PASSWORD_MIN} characters. A short sentence is easy to remember and hard to guess.`,
        },
        {
          name: "confirmPassword",
          label: "Type the new password again",
          type: "password",
          autoComplete: "new-password",
        },
      ]}
    />
  );
}
