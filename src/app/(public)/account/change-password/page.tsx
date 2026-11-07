import type { Metadata } from "next";
import { Suspense } from "react";

import { changePasswordAction } from "@/app/(public)/account/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { FlowSkeleton } from "@/components/request/flow-frame";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { WarningBox } from "@/components/shared/warning-box";
import { landingPathFor } from "@/lib/safe-next";
import { PASSWORD_MIN } from "@/lib/validation/auth";
import { guardUserPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose your password", robots: { index: false } };

export default function ChangePasswordPage() {
  return (
    <>
      <PageHeading title="Choose your password" />
      <PageContainer className="flex max-w-[560px] flex-col gap-6 py-10 md:py-14">
        <Suspense fallback={<FlowSkeleton />}>
          <ChangePasswordBody />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function ChangePasswordBody() {
  const { profile } = await guardUserPage({ path: "/account/change-password" });
  return (
    <>
      {profile.mustChangePassword ? (
        <WarningBox variant="warning" title="You signed in with a temporary password">
          Please choose your own password now. You cannot use the admin area until you do.
        </WarningBox>
      ) : null}
      <AuthForm
        action={changePasswordAction}
        submitLabel="Save my password"
        redirectOnSuccess={landingPathFor(profile.role)}
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
    </>
  );
}
