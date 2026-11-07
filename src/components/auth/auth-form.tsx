"use client";

import { useActionState, useEffect, useTransition } from "react";

import type { AuthState } from "@/app/auth/actions";
import { TurnstileWidget } from "@/components/request/turnstile-widget";
import { FieldError, FieldHint } from "@/components/shared/field-message";
import { WarningBox } from "@/components/shared/warning-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AuthField = {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  inputMode?: "email" | "text";
  hint?: string;
  defaultValue?: string;
};

type Props = {
  action: (previous: AuthState, formData: FormData) => Promise<AuthState>;
  fields: AuthField[];
  submitLabel: string;
  // Show the Cloudflare spam check (the server always checks it).
  turnstile?: boolean;
  // Hidden values, for example { next: "/account" }.
  hidden?: Record<string, string>;
  // The consent checkbox (sign up only). Its words are given as children.
  consent?: React.ReactNode;
  // Extra links under the button.
  footer?: React.ReactNode;
};

declare global {
  interface Window {
    turnstile?: { reset: () => void };
  }
}

// One form for all the sign-in screens. It uses onSubmit, so the fields keep their text after an error.
// Errors show an icon and words (never color only), and each field is linked to its error.
export function AuthForm({
  action,
  fields,
  submitLabel,
  turnstile,
  hidden,
  consent,
  footer,
}: Props) {
  const [state, run, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();

  // A Turnstile token works once. After a failed try, ask the widget for a new one.
  useEffect(() => {
    if (state && !state.ok) window.turnstile?.reset();
  }, [state]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => run(data));
  }

  const failed = state && !state.ok ? state : null;
  const done = state?.ok ? state : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      {failed ? (
        <WarningBox variant="danger" title="That did not work">
          {failed.message}
        </WarningBox>
      ) : null}
      {done ? (
        <WarningBox variant="success" title="Done">
          {done.message}
        </WarningBox>
      ) : null}

      {fields.map((field) => {
        const id = `auth-${field.name}`;
        const error = failed?.errors?.[field.name];
        const describedBy = [error ? `${id}-error` : null, field.hint ? `${id}-hint` : null]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={id}>{field.label}</Label>
            <Input
              id={id}
              name={field.name}
              type={field.type ?? "text"}
              autoComplete={field.autoComplete}
              inputMode={field.inputMode}
              defaultValue={field.defaultValue}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              required
            />
            {field.hint ? <FieldHint id={`${id}-hint`}>{field.hint}</FieldHint> : null}
            {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
          </div>
        );
      })}

      {consent ? (
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 items-start gap-3 text-base">
            <input
              type="checkbox"
              name="consent"
              className="mt-1 size-5 shrink-0 accent-primary"
              aria-invalid={failed?.errors?.consent ? true : undefined}
              aria-describedby={failed?.errors?.consent ? "auth-consent-error" : undefined}
            />
            <span>{consent}</span>
          </label>
          {failed?.errors?.consent ? (
            <FieldError id="auth-consent-error">{failed.errors.consent}</FieldError>
          ) : null}
        </div>
      ) : null}

      {turnstile ? <TurnstileWidget /> : null}

      <div>
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          {submitLabel}
        </Button>
      </div>
      {footer}
    </form>
  );
}
