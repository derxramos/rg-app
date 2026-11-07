import type { Metadata } from "next";
import Link from "next/link";

import { resendVerificationAction } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default function CheckEmailPage() {
  return (
    <>
      <PageHeading
        title="Check your email"
        intro="We sent you a link. Open it to finish creating your account."
      />
      <PageContainer className="flex max-w-[560px] flex-col gap-8 py-10 md:py-14">
        <ul className="list-disc pl-5 text-base">
          <li>It can take a few minutes. Look in your spam folder too.</li>
          <li>After you open the link, you are signed in.</li>
          <li>If you used an email that already has an account, you can sign in instead.</li>
        </ul>
        <section aria-labelledby="resend-title" className="flex flex-col gap-4">
          <h2 id="resend-title" className="text-xl font-bold text-primary-ink">
            Did not get the email?
          </h2>
          <AuthForm
            action={resendVerificationAction}
            submitLabel="Send the link again"
            turnstile
            fields={[
              {
                name: "email",
                label: "Your email",
                type: "email",
                autoComplete: "email",
                inputMode: "email",
              },
            ]}
          />
        </section>
        <p className="text-base">
          <Link href="/login" className="font-bold underline">
            Go to sign in
          </Link>
        </p>
      </PageContainer>
    </>
  );
}
