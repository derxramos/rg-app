"use client";

import { CircleCheck, Send } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";

import { sendContactAction, type ContactState } from "@/app/(public)/contact/actions";
import { useBackupLinks } from "@/components/shared/backup-contact-context";
import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { FieldError, FieldHint } from "@/components/shared/field-message";
import { WarningBox } from "@/components/shared/warning-box";
import { TurnstileWidget } from "@/components/request/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input, InputWithPrefix } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_MESSAGE_MAX,
  contactFormSchema,
  fieldErrorsFrom,
  type ContactFormField,
} from "@/lib/validation/contact";

type Values = Record<ContactFormField, string>;
type Errors = Partial<Record<ContactFormField, string>>;

const EMPTY: Values = { name: "", email: "", phone: "", message: "" };
const FIELD_ORDER: ContactFormField[] = ["name", "email", "phone", "message"];

// The contact form. The browser checks the values first (fast feedback). The server checks them again,
// checks the spam test and the rate limit, and sends the email. If it cannot send, the Messenger and Viber
// links are shown, so the client can still reach us.
export function ContactForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [clientErrors, setClientErrors] = useState<Errors>({});
  const [state, send, sending] = useActionState<ContactState, FormData>(sendContactAction, { status: "idle" });
  const [, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const links = useBackupLinks();

  const serverErrors = state.status === "invalid" ? (state.errors as Errors) : {};
  const errors: Errors = { ...serverErrors, ...clientErrors };

  function update(field: ContactFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setClientErrors((current) => ({ ...current, [field]: undefined }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = contactFormSchema.safeParse(values);
    if (!result.success) {
      const found = fieldErrorsFrom(result.error);
      setClientErrors(found);
      // The focus goes to the first field with a problem.
      const first = FIELD_ORDER.find((field) => found[field]);
      if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setClientErrors({});
    const data = new FormData(event.currentTarget);
    startTransition(() => send(data));
  }

  const describedBy = (field: ContactFormField) => (errors[field] ? `contact-${field}-error` : `contact-${field}-hint`);

  if (state.status === "success") {
    return (
      <WarningBox variant="success" title="Thank you. We got your message.">
        <span className="flex items-center gap-2"><CircleCheck aria-hidden="true" className="size-5" />We will reply to the email address you gave us.</span>
      </WarningBox>
    );
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-name">Your name</Label>
        <Input id="contact-name" name="name" autoComplete="name" value={values.name} onChange={(e) => update("name", e.target.value)}
          aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy("name")} maxLength={100} />
        {errors.name ? <FieldError id="contact-name-error">{errors.name}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-email">Email</Label>
        <Input id="contact-email" name="email" type="email" autoComplete="email" inputMode="email" value={values.email}
          onChange={(e) => update("email", e.target.value)} aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email")} maxLength={200} />
        {errors.email ? <FieldError id="contact-email-error">{errors.email}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-phone">Mobile number (optional)</Label>
        <InputWithPrefix id="contact-phone" name="phone" prefix="+63" type="tel" autoComplete="tel-national" inputMode="numeric"
          placeholder="9XX XXX XXXX" value={values.phone} onChange={(e) => update("phone", e.target.value)}
          invalid={Boolean(errors.phone)} aria-describedby={describedBy("phone")} maxLength={30} />
        {errors.phone ? <FieldError id="contact-phone-error">{errors.phone}</FieldError> : <FieldHint id="contact-phone-hint">Only if you want us to call or text you.</FieldHint>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-message">Your message</Label>
        <Textarea id="contact-message" name="message" value={values.message} onChange={(e) => update("message", e.target.value)}
          aria-invalid={errors.message ? true : undefined} aria-describedby={`${describedBy("message")} contact-message-count`} />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          {errors.message ? <FieldError id="contact-message-error">{errors.message}</FieldError> : <FieldHint id="contact-message-hint">Please do not write passwords or bank details here.</FieldHint>}
          <FieldHint id="contact-message-count" className="ml-auto">{values.message.length} / {CONTACT_MESSAGE_MAX}</FieldHint>
        </div>
      </div>

      {/* A hidden trap for robots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <TurnstileWidget />

      {state.status === "failed" ? (
        <>
          <WarningBox variant="warning" title="We could not send your message">
            {state.message} Please contact us on Messenger or Viber instead.
          </WarningBox>
          <BackupContactBlock {...links} />
        </>
      ) : null}

      <div>
        <Button type="submit" size="lg" loading={sending} className="w-full sm:w-auto">
          {!sending ? <Send aria-hidden="true" /> : null}
          Send message
        </Button>
      </div>
    </form>
  );
}
