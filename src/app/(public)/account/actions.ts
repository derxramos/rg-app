"use server";

// Server Actions for the signed-in user's own account. Every one starts with withUser(), which checks the
// login first (a page check does not protect a Server Action).

import { isPanelRole } from "@/lib/permissions";
import { eq } from "drizzle-orm";

import type { AuthState } from "@/app/auth/actions";
import { normalizePhMobile } from "@/lib/phone";
import { fieldErrors, fullNameSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { logAuthEvent } from "@/server/auth/auth-log";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { withUser, type UserActionResult } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { profiles } from "@/server/db/schema";
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

// First sign in with a temporary password: the person must choose their own password.
// It also works for anyone who wants to change their password while signed in. The new password follows the
// same rules as sign up. When it works, "must change password" is switched off (only our server can do that).
export async function changePasswordAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  return toForm(
    await withUser({}, async ({ profile, ipHash }): Promise<UserActionResult> => {
      if (!supabaseAuthConfigured())
        return { ok: false, message: "Changing the password needs the Supabase keys." };
      const parsed = resetPasswordSchema.safeParse({
        password: String(formData.get("password") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      });
      if (!parsed.success)
        return {
          ok: false,
          message: "Please check the form.",
          errors: fieldErrors(parsed.error),
        };
      if (parsed.data.password.toLowerCase() === profile.email.toLowerCase())
        return {
          ok: false,
          message: "Please check the form.",
          errors: { password: "The password cannot be the same as your email." },
        };

      const supabase = await createSupabaseServer();
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (error) {
        if (error.code === "same_password")
          return {
            ok: false,
            message: "Please check the form.",
            errors: { password: "Choose a password that is different from the temporary one." },
          };
        if (error.code === "weak_password")
          return {
            ok: false,
            message: "Please check the form.",
            errors: { password: "That password is too easy to guess. Try a longer phrase." },
          };
        console.error("Password change failed:", error.code);
        return { ok: false, message: "Something went wrong. Please try again." };
      }
      // A new password ends every other login of this account.
      await supabase.auth.signOut({ scope: "others" });

      const db = getDb();
      await db
        .update(profiles)
        .set({ mustChangePassword: false })
        .where(eq(profiles.id, profile.id));
      await logAuthEvent(db, {
        action: "auth.password_reset",
        userId: profile.id,
        isAdmin: isPanelRole(profile.role),
        ipHash,
        details: { reason: "changed-while-signed-in" },
      });
      return { ok: true, message: "Your new password is saved." };
    }),
  );
}
