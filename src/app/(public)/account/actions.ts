"use server";

// Server Actions for the signed-in user's own account. Every one starts with withUser(), which checks the
// login first (a page check does not protect a Server Action).

import type { AuthState } from "@/app/auth/actions";
import { normalizePhMobile } from "@/lib/phone";
import { fullNameSchema } from "@/lib/validation/auth";
import { withUser, type UserActionResult } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AccountError, updateProfile } from "@/server/services/account";

// The forms show every answer the same way (AuthForm).
function toForm(result: UserActionResult): AuthState {
  return result.ok
    ? { ok: true, message: result.message ?? "Saved." }
    : { ok: false, message: result.message, errors: result.errors };
}

export async function updateProfileAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  return toForm(
    await withUser({}, async ({ profile, ipHash }): Promise<UserActionResult> => {
      const name = fullNameSchema.safeParse(String(formData.get("fullName") ?? ""));
      if (!name.success)
        return {
          ok: false,
          message: "Please check the form.",
          errors: { fullName: name.error.issues[0].message },
        };

      const phoneText = String(formData.get("phone") ?? "").trim();
      const phone = phoneText ? normalizePhMobile(phoneText) : null;
      if (phoneText && !phone)
        return {
          ok: false,
          message: "Please check the form.",
          errors: { phone: "Please enter a Philippine mobile number, for example 917 123 4567." },
        };

      try {
        await updateProfile(getDb(), profile.id, { fullName: name.data, phone }, ipHash);
      } catch (error) {
        if (error instanceof AccountError) return { ok: false, message: error.message };
        throw error;
      }
      return { ok: true, message: "Your details were saved." };
    }),
  );
}
