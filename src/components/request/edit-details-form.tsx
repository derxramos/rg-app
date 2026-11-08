"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";

import { updateDetailsAction, type EditDetailsState } from "@/app/(public)/request/actions";
import { FieldError, FieldHint } from "@/components/shared/field-message";
import { WarningBox } from "@/components/shared/warning-box";
import { Button } from "@/components/ui/button";
import { Input, InputWithPrefix } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  requestId: string;
  serviceName: string;
  email: string;
  initial: EditDetailsState["values"];
};

// Step 1 again: the client came back with the step bar. Service and email stay as they are.
// All checks run again on the server.
export function EditDetailsForm({ requestId, serviceName, email, initial }: Props) {
  const [state, action, pending] = useActionState(updateDetailsAction.bind(null, requestId), {
    values: initial,
    errors: {},
  } satisfies EditDetailsState);
  const { values, errors } = state;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.formError ? (
        <WarningBox variant="danger" title="We could not continue">
          {state.formError}
        </WarningBox>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Service</span>
        <span className="text-lg font-bold break-words">{serviceName}</span>
        <FieldHint id="ed-service-hint">To pick another service, start a new request.</FieldHint>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ed-name">Full name</Label>
        <Input
          id="ed-name"
          name="fullName"
          autoComplete="name"
          defaultValue={values.fullName}
          maxLength={100}
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? "ed-fullName-error" : undefined}
        />
        {errors.fullName ? <FieldError id="ed-fullName-error">{errors.fullName}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ed-email">Email</Label>
        <Input id="ed-email" type="email" defaultValue={email} readOnly />
        <FieldHint id="ed-email-hint">This is the email of your account.</FieldHint>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ed-phone">Mobile number</Label>
        <InputWithPrefix
          id="ed-phone"
          name="phone"
          prefix="+63"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="9XX XXX XXXX"
          defaultValue={values.phone}
          maxLength={30}
          invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? "ed-phone-error" : "ed-phone-hint"}
        />
        {errors.phone ? (
          <FieldError id="ed-phone-error">{errors.phone}</FieldError>
        ) : (
          <FieldHint id="ed-phone-hint">
            You will need the last 4 digits to track your request.
          </FieldHint>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ed-business">Business name (optional)</Label>
        <Input
          id="ed-business"
          name="businessName"
          autoComplete="organization"
          defaultValue={values.businessName}
          maxLength={150}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ed-message">Message (optional)</Label>
        <Textarea
          id="ed-message"
          name="message"
          defaultValue={values.message}
          maxLength={2000}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "ed-message-error" : undefined}
        />
        {errors.message ? <FieldError id="ed-message-error">{errors.message}</FieldError> : null}
      </div>

      <div>
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          Save and continue
          {!pending ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </div>
    </form>
  );
}
