import type { Metadata } from "next";
import Image from "next/image";

import { ArchitectureDiagram } from "@/components/public/architecture-diagram";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { WarningBox } from "@/components/shared/warning-box";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DECISIONS, LESSONS, METRICS, METRICS_AS_OF, NEXT_STEPS } from "@/content/case-study";

// Not indexed and not linked from the menu until the owner approves it (it shows her business).
export const metadata: Metadata = {
  title: "Case study",
  description:
    "How an online request system for a small bookkeeping business was designed and built.",
  robots: { index: false, follow: false },
};

const SHOTS = [
  {
    file: "home-phone",
    alt: "The home page on a phone",
    caption: "Home, 390 px wide. Light: no photos, two small fonts.",
  },
  {
    file: "payment-phone",
    alt: "The payment page on a phone with a sample QR code",
    caption:
      "Pay by QR. The account name is large, with a warning to check it. The QR is a clearly fake sample.",
  },
  {
    file: "receipt-phone",
    alt: "The receipt step on a phone after the receipt was read",
    caption:
      "Receipt reading in the browser. Fields say 'Read from image. Please check.' Every field can be changed.",
  },
  {
    file: "tracking-phone",
    alt: "The tracking page on a phone",
    caption:
      "Tracking shows only the status, a timeline and our message. Never documents or contact details.",
  },
  {
    file: "admin-verify-desktop",
    alt: "The admin payment check with the strong warning",
    caption: "Admin: the warning is always above Verify, and Verify needs a tick.",
  },
  {
    file: "admin-dashboard-desktop",
    alt: "The admin dashboard",
    caption: "Admin dashboard: what needs action, storage, emails, job times.",
  },
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-2xl font-bold text-primary-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="max-w-prose text-base">{children}</p>
);

export default function CaseStudyPage() {
  return (
    <>
      <PageHeading
        title="Case study: an online request system for a small bookkeeping business"
        intro="RG'S Bookkeeping and Accounting Services needed a safe way to take requests, documents and payments from clients on phones, at no monthly cost."
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="primary">{METRICS.phases} phases</Badge>
          <Badge variant="success">Cost: {METRICS.monthlyCost} per month</Badge>
          <Badge variant="neutral">Next.js, TypeScript, Postgres</Badge>
        </div>
      </PageHeading>

      <PageContainer className="flex flex-col gap-12 py-10 md:py-14">
        <WarningBox variant="info" title="All data here is fake">
          Screens use made-up names, made-up numbers and a QR picture that says SAMPLE. No real
          client appears on this page. Numbers are from this project&apos;s own tests, as of{" "}
          {METRICS_AS_OF}.
        </WarningBox>

        <Section id="problem" title="The problem and the people">
          <P>
            Clients of a small Philippine bookkeeping business send documents by Messenger and pay
            by GCash, Maya or bank transfer. Nothing is in one place, payments are hard to check,
            and files sit in chat apps.
          </P>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Clients</CardTitle>
                <CardDescription className="text-base">
                  Use phones, often on slow mobile data, and are not technical. They need a code to
                  follow their request, with no account to remember.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>The owner and 1 to 2 staff</CardTitle>
                <CardDescription className="text-base">
                  Need one list of requests, safe access to documents, and a way to check each
                  payment in their own account.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </Section>

        <Section id="constraints" title="The constraints that shaped everything">
          <ul className="grid gap-3 md:grid-cols-3">
            <li>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>$0 per month</CardTitle>
                  <CardDescription className="text-base">
                    Free plans only: Supabase, Netlify (a hard credit limit), Brevo (300 emails a
                    day), GitHub Actions. Static pages, few deploys, two small scheduled jobs.
                  </CardDescription>
                </CardHeader>
              </Card>
            </li>
            <li>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Slow data</CardTitle>
                  <CardDescription className="text-base">
                    {METRICS.fonts}, no photos, drawings made of CSS and SVG, tap targets of 44 px
                    or more, and the heavy receipt reader loads only when asked.
                  </CardDescription>
                </CardHeader>
              </Card>
            </li>
            <li>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Privacy</CardTitle>
                  <CardDescription className="text-base">
                    Clients send ID documents. The Data Privacy Act applies. Files are private,
                    deleted on a schedule, and never shown on the tracking page.
                  </CardDescription>
                </CardHeader>
              </Card>
            </li>
          </ul>
        </Section>

        <Section id="architecture" title="How it fits together">
          <ArchitectureDiagram />
          <ul className="max-w-prose list-disc space-y-1 pl-6 text-base">
            <li>The client phone and the admin browser talk only to the Next.js app.</li>
            <li>
              The app is the only thing that talks to the database and the private file bucket.
            </li>
            <li>
              Brevo sends email and Cloudflare Turnstile checks for robots. The app verifies the
              Turnstile answer itself.
            </li>
            <li>
              GitHub Actions runs a keep-alive and a daily cleanup, straight against Supabase.
            </li>
            <li>The receipt reader runs only in the browser.</li>
          </ul>
        </Section>

        <Section id="decisions" title="Key decisions">
          <ul className="flex flex-col gap-4">
            {DECISIONS.map((d) => (
              <li key={d.decision}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{d.decision}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-base">
                      <strong className="font-bold">Why: </strong>
                      {d.why}
                    </p>
                    <p className="text-base text-muted-foreground">
                      <strong className="font-bold">Trade-off: </strong>
                      {d.tradeOff}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="security" title="The security story">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>The QR swap</CardTitle>
              </CardHeader>
              <CardContent>
                <P>
                  The scariest attack: someone changes the payment QR to their own account. So only
                  the owner can edit payment methods, a change needs a fresh code from the
                  authenticator app, every change is logged with before and after values (also by a
                  database trigger, in case the app has a bug), the owner gets an alert email, and
                  each payment saves the account the client saw.
                </P>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Private files</CardTitle>
              </CardHeader>
              <CardContent>
                <P>
                  The bucket is private. The server checks the real file type from the first bytes.
                  The admin opens a file through a link that works for 60 seconds, and each open is
                  logged. Files are deleted on a schedule. Storage is deleted first, then the
                  database, so a failure never leaves a file without a record.
                </P>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tracking by design</CardTitle>
              </CardHeader>
              <CardContent>
                <P>
                  Tracking needs the code and the last 4 digits. Every failure gives the same
                  message. Five wrong tries lock the code for 15 minutes, even for a code that does
                  not exist, so nobody learns which codes are real. The page shows 8 fields and
                  nothing private, and a test proves it.
                </P>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section id="ocr" title="The receipt reader">
          <P>
            Clients can skip typing: the browser reads their payment screenshot with Tesseract.js.
            The picture is never uploaded or stored. Only four typed values are saved, and a test
            checks that no request contains the picture bytes. Reading is two passes: the first
            finds where the labels are, the second reads only the number areas with a digits-only
            list. Small parsers per app (GCash, Maya, BDO) turn the text into fields, and the server
            checks every value again. The admin screen always warns that these values can be wrong
            or fake.
          </P>
          <ul className="grid gap-3 sm:grid-cols-3">
            <li>
              <Card className="gap-1 p-4 md:p-4">
                <span className="text-3xl font-bold">{METRICS.ocr.downloadMb} MB</span>
                <span className="text-sm text-muted-foreground">first download, from a CDN</span>
              </Card>
            </li>
            <li>
              <Card className="gap-1 p-4 md:p-4">
                <span className="text-3xl font-bold">{METRICS.ocr.seconds} s</span>
                <span className="text-sm text-muted-foreground">
                  to read one clean test receipt
                </span>
              </Card>
            </li>
            <li>
              <Card className="gap-1 p-4 md:p-4">
                <span className="text-3xl font-bold">Not yet</span>
                <span className="text-sm text-muted-foreground">accuracy on real receipts</span>
              </Card>
            </li>
          </ul>
          <WarningBox variant="warning" title="What these numbers are, and are not">
            The speed and size were measured in Chrome on the developer&apos;s computer, with a{" "}
            <strong className="font-bold">synthetic</strong> receipt drawn by a test. No real GCash,
            Maya or BDO receipts were collected, so there are{" "}
            <strong className="font-bold">no accuracy numbers</strong>, and the parser label
            patterns are placeholders. The goals are: amount 90%, reference 80%, date 80% correct on
            clear screenshots.
          </WarningBox>
        </Section>

        <Section id="screens" title="Screens (fake data only)">
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SHOTS.map((s) => (
              <li key={s.file}>
                <figure className="flex h-full flex-col gap-2">
                  <Image
                    src={`/case-study/${s.file}.jpg`}
                    alt={s.alt}
                    width={s.file.endsWith("desktop") ? 1280 : 390}
                    height={s.file.endsWith("desktop") ? 800 : 844}
                    unoptimized
                    className="h-auto w-full rounded-lg border bg-card shadow-sm"
                  />
                  <figcaption className="text-sm text-muted-foreground">{s.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="quality" title="How it was checked">
          <ul className="max-w-prose list-disc space-y-1 pl-6 text-base">
            <li>
              {METRICS.unitTests} unit tests, including the database rules on a real Postgres
              running in memory (triggers, constraints, permissions).
            </li>
            <li>
              {METRICS.browserTests} browser tests in real Chrome on a phone and a desktop profile:
              the full request flow, tracking, the admin payment check, and no
              Content-Security-Policy violations on 13 pages.
            </li>
            <li>
              Lighthouse on the public pages (mobile): performance {METRICS.lighthouse.performance},
              accessibility {METRICS.lighthouse.accessibility}, SEO {METRICS.lighthouse.seo}.
            </li>
            <li>
              Source tests for the rules: every admin action checks access, every server file is
              marked server-only, no secret reaches the browser.
            </li>
            <li>
              A security checklist that marks each item as verified, built but not verified live, or
              an owner action.
            </li>
          </ul>
        </Section>

        <Section id="lessons" title="What I learned">
          <ul className="flex max-w-prose flex-col gap-3">
            {LESSONS.map((l) => (
              <li key={l} className="rounded-lg border bg-card p-4 text-base">
                {l}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="next" title="What I would do next">
          <ul className="max-w-prose list-disc space-y-1 pl-6 text-base">
            {NEXT_STEPS.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Section>
      </PageContainer>
    </>
  );
}
