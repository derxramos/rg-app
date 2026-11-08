"use client";

import { Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { startEnrollAction, verifyEnrollAction } from "@/app/admin/(auth)/actions";
import { ActionForm } from "@/components/admin/action-form";
import { WarningBox } from "@/components/shared/warning-box";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Enroll = { factorId: string; qr: string; secret: string };

// Two devices are needed: an authenticator app and a backup (Supabase gives no recovery codes, and a
// recovery by email would make 2-step login useless). The same QR code can be scanned on two phones.
//   mode "required"  = the setup after the first sign in or after a reset: the admin area stays closed
//   mode "optional"  = the Security page: add one more device when you want
export function MfaSetup({
  verifiedCount,
  mode = "required",
}: {
  verifiedCount: number;
  mode?: "required" | "optional";
}) {
  const [count, setCount] = useState(verifiedCount);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [name, setName] = useState(verifiedCount === 0 ? "My phone" : "Backup phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await startEnrollAction(name);
    setBusy(false);
    if (result.ok) setEnroll(result);
    else setError(result.message);
  }

  // Required mode is finished with two devices. The Security page just shows the new list.
  if (mode === "required" && count >= 2) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-primary-ink">You are set up</h1>
        <p className="text-base">
          Your authenticator app and your backup device are ready. Keep the backup device safe.
        </p>
        <Link href="/admin" className={buttonVariants()}>
          Go to the admin area
        </Link>
      </div>
    );
  }

  const step = count + 1;
  const title =
    mode === "optional"
      ? "Add a device"
      : step === 1
        ? "Step 1 of 2: your authenticator app"
        : "Step 2 of 2: a backup device";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-primary-ink">{title}</h1>
      {error ? (
        <WarningBox variant="danger" title="That did not work">
          {error}
        </WarningBox>
      ) : null}
      {!enroll ? (
        <>
          <p className="text-base text-muted-foreground">
            {step === 1
              ? "Every account that opens the admin area needs a 6-digit code from an authenticator app (for example Google Authenticator or Microsoft Authenticator)."
              : "If you lose your phone and have no second device, a person must reset your 2-step login. A backup device avoids that."}{" "}
            You can also scan the same QR code on two phones.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="device-name">Name of this device</Label>
            <Input
              id="device-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              placeholder="For example: Rosemarie's phone"
            />
          </div>
          <Button size="lg" onClick={start} loading={busy}>
            <Smartphone aria-hidden="true" />
            Start setup
          </Button>
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-base">
            <li>Open your authenticator app and add an account.</li>
            <li>Scan this picture. If you cannot scan, type the secret text.</li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          {/* The QR picture comes from Supabase as an image data address. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enroll.qr}
            alt="QR code for your authenticator app"
            className="mx-auto size-48 rounded-md border bg-white p-2"
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Secret text</span>
            <code className="rounded-md bg-muted p-2 font-mono text-sm break-all">
              {enroll.secret}
            </code>
          </div>
          <ActionForm
            action={async (previous, formData) => {
              const result = await verifyEnrollAction(previous, formData);
              if (result.ok) {
                setCount(result.verifiedCount ?? count + 1);
                setEnroll(null);
                setName("Backup phone");
              }
              return result;
            }}
            hidden={{ factorId: enroll.factorId }}
            submitLabel="Check the code"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="enroll-code">Code</Label>
              <Input
                id="enroll-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                required
              />
            </div>
          </ActionForm>
        </>
      )}
    </div>
  );
}
