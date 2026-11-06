"use client";

import { Send } from "lucide-react";
import { useRef, useState } from "react";

import { useBackupLinks } from "@/components/shared/backup-contact-context";
import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { FieldError, FieldHint } from "@/components/shared/field-message";
import { WarningBox } from "@/components/shared/warning-box";
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

// Phase 2: this is the form screen only. It checks the values and shows errors, but it does NOT
// send anything yet. Sending (server action, Turnstile, rate limit, email) comes in Phase 6.
// Until then, a valid form shows the "could not send" state with the Messenger and Viber links.
export function ContactForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [notReady, setNotReady] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const links = useBackupLinks();

  function update(field: ContactFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // Clear the error for a field as soon as the person edits it.
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotReady(false);

    const result = contactFormSchema.safeParse(values);
    if (!result.success) {
      const found = fieldErrorsFrom(result.error);
      setErrors(found);
      // Move the focus to the first field with a problem, so keyboard and screen reader users land there.
      const first = FIELD_ORDER.find((field) => found[field]);
      if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setErrors({});
    setNotReady(true);
  }

  function describedBy(field: ContactFormField) {
    return errors[field] ? `contact-${field}-error` : `contact-${field}-hint`;
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-name">Your name</Label>
        <Input
          id="contact-name"
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy("name")}
          maxLength={100}
        />
        {errors.name ? <FieldError id="contact-name-error">{errors.name}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={(event) => update("email", event.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email")}
          maxLength={200}
        />
        {errors.email ? <FieldError id="contact-email-error">{errors.email}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-phone">Mobile number (optional)</Label>
        <InputWithPrefix
          id="contact-phone"
          name="phone"
          prefix="+63"
          type="tel"
          autoComplete="tel-national"
          inputMode="numeric"
          placeholder="9XX XXX XXXX"
          value={values.phone}
          onChange={(event) => update("phone", event.target.value)}
          invalid={Boolean(errors.phone)}
          aria-describedby={describedBy("phone")}
          maxLength={30}
        />
        {errors.phone ? (
          <FieldError id="contact-phone-error">{errors.phone}</FieldError>
        ) : (
          <FieldHint id="contact-phone-hint">Only if you want us to call or text you.</FieldHint>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-message">Your message</Label>
        <Textarea
          id="contact-message"
          name="message"
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={`${describedBy("message")} contact-message-count`}
        />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          {errors.message ? (
            <FieldError id="contact-message-error">{errors.message}</FieldError>
          ) : (
            <FieldHint id="contact-message-hint">
              Please do not write passwords or bank details here.
            </FieldHint>
          )}
          <FieldHint id="contact-message-count" className="ml-auto">
            {values.message.length} / {CONTACT_MESSAGE_MAX}
          </FieldHint>
        </div>
      </div>

      {notReady ? (
        <WarningBox variant="warning" title="We could not send your message yet">
          Sending messages from this page is not switched on yet. Please contact us on Messenger or
          Viber instead.
        </WarningBox>
      ) : null}
      {notReady ? <BackupContactBlock {...links} /> : null}

      <div>
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          <Send aria-hidden="true" />
          Send message
        </Button>
      </div>
    </form>
  );
}
