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

// First login: the admin must set up an authenticator app before they can see anything.
// Then they are asked to add a second device as a backup (Supabase gives no recovery codes).
export function MfaSetup() {
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await startEnrollAction();
    setBusy(false);
    if (result.ok) setEnroll(result);
    else setError(result.message);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-primary-ink">You are set up</h1>
        <WarningBox variant="info" title="Add a backup device">
          Supabase does not give recovery codes. If you lose your phone, you could be locked out.
          Set up a second authenticator device now, and keep it safe.
        </WarningBox>
        <Button
          variant="outline"
          onClick={() => {
            setDone(false);
            setEnroll(null);
          }}
        >
          Add a backup device
        </Button>
        <Link href="/admin" className={buttonVariants()}>
          Go to the admin area
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-primary-ink">Set up your authenticator app</h1>
      {error ? (
        <WarningBox variant="danger" title="That did not work">
          {error}
        </WarningBox>
      ) : null}
      {!enroll ? (
        <>
          <p className="text-base text-muted-foreground">
            Every admin needs a 6-digit code from an authenticator app (for example Google
            Authenticator or Microsoft Authenticator) to log in.
          </p>
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
              if (result.ok) setDone(true);
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
