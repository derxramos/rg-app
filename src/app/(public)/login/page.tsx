import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { loginAction } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { FlowSkeleton } from "@/components/request/flow-frame";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { WarningBox } from "@/components/shared/warning-box";
import { isGoogleSignInEnabled } from "@/lib/google-signin";
import { landingPathFor, safeNextPath } from "@/lib/safe-next";
import { getViewer } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

// What to tell the person when Google sign in did not finish. No technical words.
const GOOGLE_MESSAGES: Record<string, { title: string; text: string }> = {
  "google-admin": {
    title: "Admins sign in with email and password",
    text: "Please use the email and password form below. Admin accounts cannot use Google.",
  },
  "google-cancelled": {
    title: "Google sign in was cancelled",
    text: "No problem. You can try again, or use your email and password.",
  },
  "google-failed": {
    title: "We could not sign you in with Google",
    text: "Please try again, or use your email and password.",
  },
  "google-busy": {
    title: "Too many tries",
    text: "Please wait a few minutes and try again.",
  },
  "google-off": {
    title: "Google sign in is not available",
    text: "Please use your email and password.",
  },
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <PageHeading
        title="Sign in"
        intro="Sign in to send a request and to see how your requests are going."
      />
      <PageContainer className="flex max-w-[560px] flex-col gap-6 py-10 md:py-14">
        <Suspense fallback={<FlowSkeleton />}>
          <LoginBody searchParams={searchParams} />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function LoginBody({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next), "");
  const reason = first(params.reason);

  // Already signed in: go where they wanted, or to their own start page.
  const viewer = await getViewer();
  if (viewer.kind !== "visitor") redirect(safeNextPath(next, landingPathFor(viewer.kind)));

  const devEmails =
    process.env.NODE_ENV === "development"
      ? (process.env.DEV_USER_BYPASS_EMAILS ?? "")
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean)
      : [];

  return (
    <>
      {reason && GOOGLE_MESSAGES[reason] ? (
        <WarningBox variant="warning" title={GOOGLE_MESSAGES[reason].title}>
          {GOOGLE_MESSAGES[reason].text}
        </WarningBox>
      ) : null}

      {isGoogleSignInEnabled(process.env.GOOGLE_SIGNIN_ENABLED) ? (
        <>
          <GoogleButton next={next || undefined} />
          <OrDivider />
        </>
      ) : null}

      {reason === "expired" ? (
        <WarningBox variant="warning" title="Your session ended">
          Please sign in again. We will take you back to where you were.
        </WarningBox>
      ) : null}

      <AuthForm
        action={loginAction}
        submitLabel="Sign in"
        turnstile
        hidden={{ next }}
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "username",
            inputMode: "email",
          },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
        footer={
          <div className="flex flex-col gap-2 text-base">
            <Link href="/forgot-password" className="min-h-11 py-2 font-bold underline">
              Forgot your password?
            </Link>
            <p>
              New here?{" "}
              <Link href="/register" className="font-bold underline">
                Create an account
              </Link>
            </p>
            <p className="text-sm text-muted-foreground">
              Only have a tracking code?{" "}
              <Link href="/track" className="font-bold underline">
                Track my request
              </Link>
              .
            </p>
          </div>
        }
      />

      {devEmails.length > 0 ? (
        <WarningBox variant="warning" title="Development test login is ON">
          This box shows only on a development computer. Sign in as a test user without Supabase:
          <ul className="mt-2 flex flex-col gap-1">
            {devEmails.map((email) => (
              <li key={email}>
                <a
                  className="font-bold underline"
                  href={`/api/dev-login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next || "/account")}`}
                >
                  {email}
                </a>
              </li>
            ))}
          </ul>
        </WarningBox>
      ) : null}
    </>
  );
}
