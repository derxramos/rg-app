"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { createDraftAction, type DraftFormState } from "@/app/(public)/request/actions";
import { TurnstileWidget } from "@/components/request/turnstile-widget";
import { FieldError, FieldHint } from "@/components/shared/field-message";
import { WarningBox } from "@/components/shared/warning-box";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
import { Input, InputWithPrefix } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  services: { slug: string; name: string }[];
  selectedSlug?: string;
};

// Step 1: service and contact details. All checks run again on the server.
export function RequestForm({ services, selectedSlug }: Props) {
  const initial: DraftFormState = {
    values: {
      serviceSlug: selectedSlug ?? "",
      fullName: "",
      email: "",
      phone: "",
      businessName: "",
      message: "",
    },
    errors: {},
  };
  const [state, action, pending] = useActionState(createDraftAction, initial);
  const { values, errors } = state;
  const described = (field: string) => (errors[field] ? `rf-${field}-error` : undefined);

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.formError ? (
        <WarningBox variant="danger" title="We could not continue">
          {state.formError}
        </WarningBox>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-service">Service</Label>
        <NativeSelect
          id="rf-service"
          name="serviceSlug"
          defaultValue={values.serviceSlug}
          aria-invalid={errors.serviceSlug ? true : undefined}
          aria-describedby={described("serviceSlug")}
        >
          <option value="" disabled>
            Choose a service
          </option>
          {services.map((service) => (
            <option key={service.slug} value={service.slug}>
              {service.name}
            </option>
          ))}
        </NativeSelect>
        {errors.serviceSlug ? (
          <FieldError id="rf-serviceSlug-error">{errors.serviceSlug}</FieldError>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-name">Full name</Label>
        <Input
          id="rf-name"
          name="fullName"
          autoComplete="name"
          defaultValue={values.fullName}
          maxLength={100}
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={described("fullName")}
        />
        {errors.fullName ? <FieldError id="rf-fullName-error">{errors.fullName}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-email">Email</Label>
        <Input
          id="rf-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={values.email}
          maxLength={200}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={described("email")}
        />
        {errors.email ? <FieldError id="rf-email-error">{errors.email}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-phone">Mobile number</Label>
        <InputWithPrefix
          id="rf-phone"
          name="phone"
          prefix="+63"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="9XX XXX XXXX"
          defaultValue={values.phone}
          maxLength={30}
          invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? "rf-phone-error" : "rf-phone-hint"}
        />
        {errors.phone ? (
          <FieldError id="rf-phone-error">{errors.phone}</FieldError>
        ) : (
          <FieldHint id="rf-phone-hint">
            You will need the last 4 digits to track your request.
          </FieldHint>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-business">Business name (optional)</Label>
        <Input
          id="rf-business"
          name="businessName"
          autoComplete="organization"
          defaultValue={values.businessName}
          maxLength={150}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-message">Message (optional)</Label>
        <Textarea
          id="rf-message"
          name="message"
          defaultValue={values.message}
          maxLength={2000}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={described("message")}
        />
        {errors.message ? <FieldError id="rf-message-error">{errors.message}</FieldError> : null}
      </div>

      {/* A hidden trap for robots. People never see it or fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <CheckboxRow htmlFor="rf-consent">
          <Checkbox
            id="rf-consent"
            name="consent"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={described("consent")}
          />
          <span>
            I agree that RG&apos;S Bookkeeping and Accounting Services may use my information for
            this request. I have read the{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="font-bold text-primary underline underline-offset-4"
            >
              privacy notice
            </Link>{" "}
            and the{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-bold text-primary underline underline-offset-4"
            >
              terms of service
            </Link>
            .
          </span>
        </CheckboxRow>
        {errors.consent ? <FieldError id="rf-consent-error">{errors.consent}</FieldError> : null}
      </div>

      <TurnstileWidget />

      <div>
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          Continue
          {!pending ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </div>
    </form>
  );
}
