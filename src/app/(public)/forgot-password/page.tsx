import type { Metadata } from "next";
import Link from "next/link";

import { forgotPasswordAction } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";

export const metadata: Metadata = { title: "Forgot your password?", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <PageHeading
        title="Forgot your password?"
        intro="Type your email. We will send you a link to choose a new password."
      />
      <PageContainer className="flex max-w-[560px] flex-col gap-6 py-10 md:py-14">
        <AuthForm
          action={forgotPasswordAction}
          submitLabel="Send the link"
          turnstile
          fields={[
            {
              name: "email",
              label: "Email",
              type: "email",
              autoComplete: "username",
              inputMode: "email",
            },
          ]}
          footer={
            <p className="text-base">
              <Link href="/login" className="font-bold underline">
                Back to sign in
              </Link>
            </p>
          }
        />
      </PageContainer>
    </>
  );
}
