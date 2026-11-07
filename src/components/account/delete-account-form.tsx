"use client";

import type { AuthState } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth/auth-form";

// Calls POST /api/account/delete with fetch (see the route for why it is not a Server Action), shows the
// answer in the same way as the other forms, and loads the home page in full after a good result.
async function deleteAccount(_previous: AuthState, formData: FormData): Promise<AuthState> {
  try {
    const response = await fetch("/api/account/delete", { method: "POST", body: formData });
    return (await response.json()) as AuthState;
  } catch {
    return { ok: false, message: "We could not reach the server. Please try again." };
  }
}

export function DeleteAccountForm() {
  return (
    <AuthForm
      action={deleteAccount}
      submitLabel="Delete my account"
      submitVariant="destructive"
      redirectOnSuccess="/"
      fields={[
        { name: "confirm", label: "Type DELETE to confirm", autoComplete: "off" },
        {
          name: "password",
          label: "Your password",
          type: "password",
          autoComplete: "current-password",
        },
      ]}
    />
  );
}
