"use client";

import { Lock, Search } from "lucide-react";
import { useActionState } from "react";

import { trackAction, type TrackState } from "@/app/(public)/track/actions";
import { TurnstileWidget } from "@/components/request/turnstile-widget";
import { FieldHint } from "@/components/shared/field-message";
import { WarningBox } from "@/components/shared/warning-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The tracking form. The same error shows for a wrong code and for wrong digits.
export function TrackForm() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackAction, { status: "idle" });

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === "locked" ? (
        <WarningBox variant="danger" title="This code is locked for a short time">
          <span className="flex items-start gap-2"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{state.message}</span>
        </WarningBox>
      ) : state.status !== "idle" ? (
        <WarningBox variant={state.status === "limited" ? "warning" : "danger"} title="We could not open your request">{state.message}</WarningBox>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="tr-code">Tracking code</Label>
        <Input id="tr-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="RG-XXXXXXXX" maxLength={20}
          className="font-mono uppercase" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tr-last4">Last 4 digits of your mobile number</Label>
        <Input id="tr-last4" name="last4" inputMode="numeric" autoComplete="off" maxLength={4} pattern="[0-9]{4}" className="max-w-40" required />
        <FieldHint>The number you gave us when you started the request.</FieldHint>
      </div>

      <TurnstileWidget />

      <div>
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          {!pending ? <Search aria-hidden="true" /> : null}
          Show my request
        </Button>
      </div>
    </form>
  );
}
