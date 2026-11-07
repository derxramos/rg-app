import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { registerAction } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { FlowSkeleton } from "@/components/request/flow-frame";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { isGoogleSignInEnabled } from "@/lib/google-signin";
import { landingPathFor } from "@/lib/safe-next";
import { PASSWORD_MIN } from "@/lib/validation/auth";
import { getViewer } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <>
      <PageHeading
        title="Create an account"
        intro="An account lets you send requests and follow them in one place."
      />
      <PageContainer className="flex max-w-[560px] flex-col gap-6 py-10 md:py-14">
        <Suspense fallback={<FlowSkeleton />}>
          <RegisterBody />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function RegisterBody() {
  const viewer = await getViewer();
  if (viewer.kind !== "visitor") redirect(landingPathFor(viewer.kind));

  return (
    <>
      {isGoogleSignInEnabled(process.env.GOOGLE_SIGNIN_ENABLED) ? (
        <>
          <GoogleButton label="Sign up with Google" />
          <OrDivider>or create an account with your email</OrDivider>
        </>
      ) : null}
      <AuthForm
        action={registerAction}
        submitLabel="Create account"
        turnstile
        fields={[
          { name: "fullName", label: "Full name", autoComplete: "name" },
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "email",
            inputMode: "email",
            hint: "We send a link to this address. You must open it before you can send a request.",
          },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "new-password",
            hint: `At least ${PASSWORD_MIN} characters. A short sentence is easy to remember and hard to guess.`,
          },
          {
            name: "confirmPassword",
            label: "Type the password again",
            type: "password",
            autoComplete: "new-password",
          },
        ]}
        consent={
          <>
            I have read the{" "}
            <Link href="/privacy" target="_blank" rel="noopener" className="font-bold underline">
              Privacy notice
            </Link>{" "}
            and the{" "}
            <Link href="/terms" target="_blank" rel="noopener" className="font-bold underline">
              Terms
            </Link>
            , and I agree.
          </>
        }
        footer={
          <p className="text-base">
            Already have an account?{" "}
            <Link href="/login" className="font-bold underline">
              Sign in
            </Link>
          </p>
        }
      />
    </>
  );
}
