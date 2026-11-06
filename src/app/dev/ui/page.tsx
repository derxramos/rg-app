import { FileText, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { EmptyState } from "@/components/shared/empty-state";
import { FieldError, FieldHint } from "@/components/shared/field-message";
import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/shared/page-container";
import { PAYMENT_STATE_KEYS, PaymentStateBadge } from "@/components/shared/payment-state-badge";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { BADGE_STATUSES, StatusBadge } from "@/components/shared/status-badge";
import { Stepper } from "@/components/shared/stepper";
import { TrackingCode } from "@/components/shared/tracking-code";
import { WarningBox } from "@/components/shared/warning-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
import { Input, InputWithPrefix } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  NativeSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatPesos } from "@/lib/money";
import { formatManilaDateTime } from "@/lib/time";

import { DialogDemo, LoadingButtonDemo, ThemeSwitch, ToastDemo } from "./demos";

// Temporary design check page. It is not linked from anywhere and is blocked in production.
export const metadata: Metadata = {
  title: "UI check (development only)",
  robots: { index: false, follow: false },
};

const COLOR_TOKENS = [
  "primary",
  "primary-hover",
  "primary-soft",
  "primary-ink",
  "brand-accent",
  "brand-accent-soft",
  "highlight",
  "success",
  "success-soft",
  "warning",
  "warning-soft",
  "danger",
  "danger-soft",
  "info",
  "info-soft",
  "surface",
  "surface-subtle",
  "surface-sunken",
  "border",
  "input-border",
  "text",
  "text-muted",
] as const;

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 py-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">{title}</h2>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const sampleCode = "RG-7K3M9QXD";
  const sampleTime = "2026-11-06T01:37:00Z";

  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <PageContainer className="divide-y">
          <Section
            title="UI check"
            note="Development only. Compare each block with docs/DESIGN_SYSTEM.md. Use Tab to check the focus ring on every control."
          >
            <ThemeSwitch />
          </Section>

          <Section
            title="Colors"
            note="Section 2 tokens. Switch the palette above to check Harbor Navy."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {COLOR_TOKENS.map((token) => (
                <div key={token} className="flex flex-col gap-1">
                  <span
                    className="h-12 rounded-md border"
                    style={{ background: `var(--${token})` }}
                    aria-hidden="true"
                  />
                  <span className="text-xs break-all">--{token}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Type scale and fonts"
            note="Weights 400 and 700 only. The peso sign must show: ₱1,250.00"
          >
            <div className="flex flex-col gap-2">
              <p className="text-4xl font-bold">text-4xl hero ₱</p>
              <p className="text-3xl font-bold">text-3xl heading ₱</p>
              <p className="text-2xl font-bold">text-2xl heading ₱</p>
              <p className="text-xl font-bold">text-xl heading ₱</p>
              <p className="text-lg">text-lg body large ₱1,250.00</p>
              <p className="text-base">text-base body ₱1,250.00 (regular 400)</p>
              <p className="text-base font-bold">text-base bold ₱1,250.00 (bold 700)</p>
              <p className="text-sm">text-sm small ₱1,250.00</p>
              <p className="text-xs">text-xs caption ₱1,250.00</p>
              <p className="font-mono text-base">font-mono RG-7K3M9QXD</p>
            </div>
          </Section>

          <Section
            title="Money and time helpers"
            note="Money is stored in centavos. Times are stored in UTC and shown in Asia/Manila."
          >
            <ul className="flex flex-col gap-1 text-base">
              <li>formatPesos(125000) = {formatPesos(125000)}</li>
              <li>formatPesos(15050) = {formatPesos(15050)}</li>
              <li>
                formatManilaDateTime(&quot;{sampleTime}&quot;) = {formatManilaDateTime(sampleTime)}
              </li>
            </ul>
          </Section>

          <Section title="Logo" note="Tile from public/brand. Words are live text.">
            <div className="flex flex-wrap items-center gap-6">
              <Logo />
              <Logo showWordmark={false} />
              <span className="rounded-lg bg-primary p-4">
                <Logo inverse />
              </span>
            </div>
          </Section>

          <Section title="Buttons" note="Heights: sm 44 on phone and 40 from md, md 44, lg 52.">
            <div className="flex flex-col gap-4">
              {(["default", "secondary", "outline", "ghost", "destructive", "accent"] as const).map(
                (variant) => (
                  <div key={variant} className="flex flex-wrap items-center gap-3">
                    <span className="w-24 text-sm text-muted-foreground">{variant}</span>
                    <Button variant={variant} size="sm">
                      Small
                    </Button>
                    <Button variant={variant}>Medium</Button>
                    <Button variant={variant} size="lg">
                      Large
                    </Button>
                    <Button variant={variant} disabled>
                      Disabled
                    </Button>
                  </div>
                ),
              )}
              <LoadingButtonDemo />
            </div>
          </Section>

          <Section
            title="Form controls"
            note="Input and select are at least 44 px tall with 16 px text."
          >
            <div className="grid max-w-2xl gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="d-name">Full name</Label>
                <Input id="d-name" placeholder="Juan Dela Cruz" />
                <FieldHint>As written on your ID.</FieldHint>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="d-email">Email (with an error)</Label>
                <Input
                  id="d-email"
                  defaultValue="juan@"
                  aria-invalid="true"
                  aria-describedby="d-email-err"
                />
                <FieldError id="d-email-err">
                  Please enter a full email address, for example name@example.com.
                </FieldError>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="d-phone">Mobile number</Label>
                <InputWithPrefix
                  id="d-phone"
                  prefix="+63"
                  inputMode="numeric"
                  placeholder="9XX XXX XXXX"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="d-amount">Amount</Label>
                <InputWithPrefix id="d-amount" prefix="₱" inputMode="decimal" placeholder="0.00" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="d-disabled">Disabled</Label>
                <Input id="d-disabled" disabled defaultValue="Cannot change" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="d-msg">Message</Label>
                <Textarea id="d-msg" placeholder="Tell us what you need." />
                <FieldHint>0 / 2000 characters</FieldHint>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="d-select">Service (custom select)</Label>
                <Select>
                  <SelectTrigger id="d-select">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a">Sample service A</SelectItem>
                    <SelectItem value="b">Sample service B</SelectItem>
                    <SelectItem value="c">Sample service C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="d-native">Service (native select, for phones)</Label>
                <NativeSelect id="d-native" defaultValue="">
                  <option value="" disabled>
                    Choose a service
                  </option>
                  <option>Sample service A</option>
                  <option>Sample service B</option>
                </NativeSelect>
              </div>
              <div className="flex flex-col">
                <CheckboxRow htmlFor="d-consent">
                  <Checkbox id="d-consent" />
                  <span>
                    I agree to the privacy notice. This text can wrap onto two or more lines without
                    being cut.
                  </span>
                </CheckboxRow>
                <CheckboxRow htmlFor="d-checked">
                  <Checkbox id="d-checked" defaultChecked />
                  <span>A ticked box</span>
                </CheckboxRow>
                <CheckboxRow htmlFor="d-switch" className="items-center justify-between">
                  <span>Turn this service on</span>
                  <Switch id="d-switch" defaultChecked />
                </CheckboxRow>
              </div>
            </div>
          </Section>

          <Section
            title="Cards"
            note="rounded-lg, border, shadow-sm, padding 20 px (24 px from md)."
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {(["none", "subtle", "primary", "accent"] as const).map((tint) => (
                <Card key={tint} tint={tint}>
                  <CardHeader>
                    <CardTitle>Card: {tint}</CardTitle>
                    <CardDescription
                      className={
                        tint === "primary" || tint === "accent" ? "text-current" : undefined
                      }
                    >
                      Short helper text.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-base">Card content goes here.</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm" variant="outline">
                      Action
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </Section>

          <Section title="Request status badges" note="8 statuses. Each has color, icon and words.">
            <div className="flex flex-wrap gap-3">
              {BADGE_STATUSES.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              The 9th status (payment_verified, shown last) is PROVISIONAL: it reuses the success
              colors until the owner decides.
            </p>
          </Section>

          <Section title="Payment state badges">
            <div className="flex flex-wrap gap-3">
              {PAYMENT_STATE_KEYS.map((state) => (
                <PaymentStateBadge key={state} state={state} />
              ))}
            </div>
          </Section>

          <Section title="Other badges">
            <div className="flex flex-wrap gap-3">
              <Badge>Neutral</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
            </div>
          </Section>

          <Section title="Warning boxes">
            <div className="grid max-w-2xl gap-3">
              <WarningBox variant="info" title="Good to know">
                Government fees and rules may change. We will confirm them with you.
              </WarningBox>
              <WarningBox variant="warning" title="Check the account name">
                Check that the account name is the same as the one on the screen before you pay.
              </WarningBox>
              <WarningBox variant="danger" title="We could not send your message">
                Please try again, or message us on Messenger or Viber.
              </WarningBox>
              <WarningBox variant="success" title="Payment received">
                Thank you. We will check it soon.
              </WarningBox>
              <WarningBox
                variant="warning"
                strong
                title="Check this payment in your own GCash / Maya / BDO app first."
              >
                These values were typed or read by OCR from the client&apos;s screenshot. They can
                be wrong or fake.
              </WarningBox>
            </div>
          </Section>

          <Section title="Empty state">
            <div className="grid gap-4 md:grid-cols-2">
              <EmptyState
                icon={Inbox}
                title="No services listed yet"
                description="Please check again soon, or contact us."
              >
                <Button variant="outline">Contact us</Button>
              </EmptyState>
              <EmptyState icon={FileText} title="No files yet" />
            </div>
          </Section>

          <Section title="Stepper" note="5 steps. Under 640 px it is a text line and a bar.">
            <div className="grid gap-6">
              <Stepper current={1} />
              <Stepper current={3} />
              <Stepper current={5} />
            </div>
          </Section>

          <Section title="Tracking code" note="Monospace. Tap Copy to see the Copied state.">
            <TrackingCode code={sampleCode} />
            <p className="text-base font-bold">
              Save this code. You need it to check your request.
            </p>
          </Section>

          <Section
            title="Backup contact block"
            note="Hidden when a link is empty. Sample links go to example.com only."
          >
            <div className="grid gap-6 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Both links</p>
                <BackupContactBlock
                  messengerUrl="https://example.com/messenger-sample"
                  viberUrl="https://example.com/viber-sample"
                />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Only Messenger</p>
                <BackupContactBlock
                  messengerUrl="https://example.com/messenger-sample"
                  viberUrl=""
                />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">No links (nothing shows below)</p>
                <BackupContactBlock messengerUrl="" viberUrl="" />
              </div>
            </div>
          </Section>

          <Section title="Tabs">
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="done">Done</TabsTrigger>
              </TabsList>
              <TabsContent value="all">Segmented tabs, used for filters.</TabsContent>
              <TabsContent value="open">Open requests.</TabsContent>
              <TabsContent value="done">Finished requests.</TabsContent>
            </Tabs>
            <Tabs defaultValue="info" variant="underline">
              <TabsList>
                <TabsTrigger value="info">Details</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="pay">Payments</TabsTrigger>
              </TabsList>
              <TabsContent value="info">Underline tabs, used on detail pages.</TabsContent>
              <TabsContent value="files">Files tab.</TabsContent>
              <TabsContent value="pay">Payments tab.</TabsContent>
            </Tabs>
          </Section>

          <Section title="Table" note="Shown from md. Below md the real screens use cards instead.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono">RG-7K3M9QXD</TableCell>
                  <TableCell>Sample Client</TableCell>
                  <TableCell>
                    <StatusBadge status="submitted" />
                  </TableCell>
                  <TableCell>
                    <PaymentStateBadge state="not_paid" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">RG-4HP2WZ6N</TableCell>
                  <TableCell>Another Sample</TableCell>
                  <TableCell>
                    <StatusBadge status="payment_submitted" />
                  </TableCell>
                  <TableCell>
                    <PaymentStateBadge state="pending" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Section>

          <Section
            title="Progress and storage meter"
            note="Yellow at the warning percent, red at 95 percent."
          >
            <div className="grid max-w-xl gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm">Normal: 40%</span>
                <Progress value={40} aria-label="Storage used, 40 percent" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm">Warning: 82%</span>
                <Progress value={82} tone="warning" aria-label="Storage used, 82 percent" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm">Danger: 96%</span>
                <Progress value={96} tone="danger" aria-label="Storage used, 96 percent" />
              </div>
            </div>
          </Section>

          <Section title="Skeleton">
            <div className="flex max-w-md flex-col gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </Section>

          <Section title="Dialog and toast">
            <div className="flex flex-col gap-4">
              <div>
                <DialogDemo />
              </div>
              <ToastDemo />
            </div>
          </Section>

          <Section
            title="Long text test"
            note="Text can grow 30 percent in other languages. Nothing should be cut off or overlap."
          >
            <div className="flex max-w-sm flex-col gap-3">
              <Button className="w-full">
                Ipadala ang aking kahilingan at mga dokumento ngayon
              </Button>
              <Button variant="outline" className="w-full">
                Mag-sign in gamit ang aking email at password
              </Button>
              <CheckboxRow htmlFor="d-long">
                <Checkbox id="d-long" />
                <span>
                  Pinapayagan ko ang pagproseso ng aking personal na impormasyon ayon sa abiso sa
                  privacy
                </span>
              </CheckboxRow>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="waiting_for_client" />
                <StatusBadge status="payment_submitted" />
                <StatusBadge status="in_progress" />
              </div>
            </div>
          </Section>
        </PageContainer>
      </main>
      <SiteFooter
        messengerUrl="https://example.com/messenger-sample"
        viberUrl="https://example.com/viber-sample"
      />
    </>
  );
}
