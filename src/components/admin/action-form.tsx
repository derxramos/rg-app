"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";

import { WarningBox } from "@/components/shared/warning-box";
import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useTwoFactorInfo } from "@/components/admin/two-factor-context";
import type { ActionResult } from "@/server/auth/panel";

type Props = {
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  // Shows the fresh confirm field (risky actions: payment methods, accounts): the person's OWN 6-digit code,
  // or their own password when they have no authenticator app yet.
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
  // Called once after a good save (for example, to close the dialog the form is in).
  onSuccess?: () => void;
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
  onSuccess,
}: Props) {
  const [state, run, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const { mode } = useTwoFactorInfo();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      notify.success(state.message ?? "Saved.");
      if (resetOnSuccess) form.current?.reset();
      onSuccess?.();
    }
  }, [state, resetOnSuccess, onSuccess]);

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
      {fresh ? (
        <div className="flex flex-col gap-2">
          {mode === "code" ? (
            <>
              <Label htmlFor={id}>Enter the 6-digit code from YOUR authenticator app.</Label>
              <Input
                id={id}
                name="fresh2faCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                className="max-w-48"
                placeholder="123456"
              />
            </>
          ) : (
            <>
              <Label htmlFor={id}>
                You have no authenticator app yet. Enter your own account password.
              </Label>
              <Input
                id={id}
                name="confirmPassword"
                type="password"
                autoComplete="current-password"
                className="max-w-72"
              />
            </>
          )}
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
