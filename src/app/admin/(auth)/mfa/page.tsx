import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { verifyMfaAction } from "../actions";

export const metadata: Metadata = { title: "Enter your 2FA code" };

export default function AdminMfaPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-primary-ink">Your 6-digit code</h1>
      <p className="text-base text-muted-foreground">
        Open your authenticator app and type the code for RG&apos;S Bookkeeping.
      </p>
      <ActionForm action={verifyMfaAction} submitLabel="Continue" size="lg">
        <div className="flex flex-col gap-2">
          <Label htmlFor="mfa-code">Code</Label>
          <Input
            id="mfa-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            required
            autoFocus
          />
        </div>
      </ActionForm>
    </div>
  );
}
