"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";

import { WarningBox } from "@/components/shared/warning-box";
import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useTwoFactorRequired } from "@/components/admin/two-factor-context";
import type { ActionResult } from "@/server/auth/admin";

type Props = {
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  // Shows a field for a fresh 6-digit code (risky actions: payment methods, admin users).
  fresh?: boolean;
  // Empty the fields after a good save (for "add" forms).
  resetOnSuccess?: boolean;
  className?: string;
  // Hidden values, for example { intent: "delete", id: "..." }.
  hidden?: Record<string, string>;
  // Put the button inline with the fields (small forms).
  inline?: boolean;
  // Adds a "Cancel" link next to the button. It loads this address again (a full page load), which also
  // puts every field back to its saved value.
  cancelHref?: string;
};

// A form for admin Server Actions. It uses onSubmit (not the form "action" attribute), so React does
// NOT empty the fields after a failed save. Errors are shown with an icon and words.
export function ActionForm({
  action,
  children,
  submitLabel,
  variant,
  size,
  fresh,
  resetOnSuccess,
  className,
  hidden,
  inline,
  cancelHref,
}: Props) {
  const [state, run, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const twoFactorRequired = useTwoFactorRequired();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      notify.success(state.message ?? "Saved.");
      if (resetOnSuccess) form.current?.reset();
    }
  }, [state, resetOnSuccess]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => run(data));
  }

  const failed = state && !state.ok ? state : null;
  const id = `fresh-${hidden?.id ?? hidden?.intent ?? "form"}`;

  return (
    <form
      ref={form}
      onSubmit={onSubmit}
      className={cn(
        "flex flex-col gap-4",
        inline && "sm:flex-row sm:flex-wrap sm:items-end",
        className,
      )}
    >
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      {children}
      {fresh && twoFactorRequired ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id}>Your 6-digit code (from your authenticator app)</Label>
          <Input
            id={id}
            name="fresh2faCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className="max-w-48"
            placeholder="123456"
          />
        </div>
      ) : null}
      {failed ? (
        <WarningBox
          variant={failed.code === "needs-fresh-2fa" ? "warning" : "danger"}
          title={failed.code === "needs-fresh-2fa" ? "A fresh code is needed" : "That did not work"}
        >
          {failed.message}
          {failed.errors ? (
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(failed.errors).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          ) : null}
        </WarningBox>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-sm font-bold text-success-ink">
          {state.message ?? "Saved."}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={variant} size={size} loading={pending}>
          {submitLabel}
        </Button>
        {cancelHref ? (
          // A normal link on purpose: a full page load puts the fields back to their saved values.
          <a href={cancelHref} className={buttonVariants({ variant: "outline", size })}>
            Cancel
          </a>
        ) : null}
      </div>
    </form>
  );
}
