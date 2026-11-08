"use server";

// Sign in, sign up, verify, forgot and reset password. These run BEFORE a person is logged in,
// so they do not use requireUser. (Sign out is the route POST /auth/sign-out.) Everything else for logged-in people does
// (see tests/unit/admin-actions-guard.test.ts).
//
// Safe messages: we never say whether an email has an account. Login says "email or password is not right".
// Sign up, resend and forgot password always show the same answer.
// Order for each form: size/format check -> rate limit -> Turnstile -> Supabase. A Turnstile token works
// once, so a typo must not use it up.

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isPanelRole } from "@/lib/permissions";
import { landingPathFor } from "@/lib/safe-next";
import { isTwoFactorRequired } from "@/lib/two-factor-flag";
import {
  emailOnlySchema,
  fieldErrors,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { afterLoginDestination } from "@/server/auth/panel-core";
import { logAuthEvent } from "@/server/auth/auth-log";
import { ensureProfile } from "@/server/auth/session-core";
import { getSession } from "@/server/auth/session";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { profiles } from "@/server/db/schema";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";
import { hmacHex } from "@/server/security/tokens";
import { verifyTurnstile } from "@/server/security/turnstile";
import { getTokenSecret } from "@/server/env";
import { readSetting } from "@/server/services/settings";

export type AuthState =
  | { ok: true; message: string }
  | { ok: false; message: string; errors?: Record<string, string>; code?: "not-verified" }
  | null;

const NOT_SET_UP = "Sign in is not set up yet. The Supabase keys are missing in the settings.";
const TOO_MANY = "Too many tries. Please wait a while and try again.";
const SPAM_FAILED = "We could not check that you are a person. Please try again.";
const GENERIC_LOGIN_ERROR = "The email or password is not right.";
const GENERIC_FAIL = "Something went wrong. Please try again.";

async function context() {
  const ip = readClientIp(await headers());
  return { db: getDb(), ip, ipHash: hashIp(ip) };
}

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") values[key] = value;
  return values;
}

// A short label for an email, so the rate limit can count per email without keeping the address.
const emailKey = (email: string) => hmacHex(getTokenSecret(), `email:${email.toLowerCase()}`);

async function overLimit(
  db: ReturnType<typeof getDb>,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  return !(await rateLimit(db, { key, limit, windowSeconds })).allowed;
}

const turnstileOk = (formData: FormData, ip: string) =>
  verifyTurnstile({ token: String(formData.get("cf-turnstile-response") ?? ""), ip });

// ---------- Sign in ----------

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseAuthConfigured()) return { ok: false, message: NOT_SET_UP };
  const { db, ip, ipHash } = await context();

  const parsed = loginSchema.safeParse(formValues(formData));
  if (!parsed.success) return { ok: false, message: GENERIC_LOGIN_ERROR };
  const { email, password } = parsed.data;

  // 5 tries from one place and 10 for one email, in 15 minutes.
  if (
    (await overLimit(db, `login:ip:${ipHash}`, 5, 900)) ||
    (await overLimit(db, `login:email:${emailKey(email)}`, 10, 900))
  )
    return { ok: false, message: TOO_MANY };
  if (!(await turnstileOk(formData, ip))) return { ok: false, message: SPAM_FAILED };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await logAuthEvent(db, { action: "auth.login.failed", userId: null, ipHash });
    // "Email not confirmed" is only returned for the right password, so saying it reveals nothing.
    if (error?.code === "email_not_confirmed")
      return {
        ok: false,
        code: "not-verified",
        message: "Please verify your email first. Open the link we sent you, or ask for a new one.",
      };
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  // The role comes from the profiles table, never from the token.
  const profile = await ensureProfile(db, {
    userId: data.user.id,
    email: data.user.email ?? email,
    source: "supabase",
  });
  // A turned-off account cannot sign in (Supabase also refuses it: the account is banned there).
  if (!profile.isActive) {
    await supabase.auth.signOut();
    return { ok: false, message: "This account is turned off. Please contact us." };
  }
  const isAdmin = isPanelRole(profile.role);
  if (isAdmin) {
    await db.update(profiles).set({ lastLoginAt: new Date() }).where(eq(profiles.id, profile.id));
  }
  await logAuthEvent(db, { action: "auth.login.success", userId: profile.id, isAdmin, ipHash });

  // An account made by an admin with a temporary password must choose its own password first.
  // (The admin area also refuses this account until the password is changed.)
  if (profile.mustChangePassword) redirect("/account/change-password");

  // Admins: with 2FA required they must pass the code step first. With the flag "false" they go straight in.
  // Users are never asked for a code.
  const twoFactorRequired = isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA);
  let hasVerifiedFactor = false;
  if (isAdmin && twoFactorRequired) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    hasVerifiedFactor = Boolean(factors?.totp.some((f) => f.status === "verified"));
  }
  redirect(
    afterLoginDestination({
      role: profile.role,
      isActive: profile.isActive,
      mfaResetRequired: profile.mfaResetRequired,
      twoFactorRequired,
      hasVerifiedFactor,
      next: String(formData.get("next") ?? ""),
    }),
  );
}

// ---------- Sign up ----------

export async function registerAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseAuthConfigured()) return { ok: false, message: NOT_SET_UP };
  const { db, ip, ipHash } = await context();

  const parsed = registerSchema.safeParse(formValues(formData));
  if (!parsed.success)
    return {
      ok: false,
      message: "Please check the form. Some values need to be fixed.",
      errors: fieldErrors(parsed.error),
    };
  const { fullName, email, password } = parsed.data;

  if (await overLimit(db, `register:ip:${ipHash}`, 5, 3600))
    return { ok: false, message: TOO_MANY };
  if (!(await turnstileOk(formData, ip))) return { ok: false, message: SPAM_FAILED };

  const supabase = await createSupabaseServer();
  // The email link is made by the Supabase email template (docs/AUTH_AND_ROLES.md), which points to /auth/confirm.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error && error.code !== "user_already_exists") {
    if (error.code === "weak_password")
      return {
        ok: false,
        message: "Please check the form.",
        errors: { password: "That password is too easy to guess. Try a longer phrase." },
      };
    if (error.code === "over_email_send_rate_limit")
      return {
        ok: false,
        message: "We cannot send more emails right now. Please try again later.",
      };
    console.error("Sign up failed:", error.code);
    return { ok: false, message: GENERIC_FAIL };
  }

  // Same result whether the email is new or already used.
  await logAuthEvent(db, {
    action: "auth.signup",
    userId: null,
    ipHash,
    details: { privacyNoticeVersion: await readSetting(db, "privacy_notice_version") },
  });
  redirect("/register/check-email");
}

// "Send the link again" for a sign up that is not verified yet.
export async function resendVerificationAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!supabaseAuthConfigured()) return { ok: false, message: NOT_SET_UP };
  const { db, ip, ipHash } = await context();
  const parsed = emailOnlySchema.safeParse(formValues(formData));
  if (!parsed.success)
    return {
      ok: false,
      message: "Please enter a full email address.",
      errors: fieldErrors(parsed.error),
    };
  const { email } = parsed.data;

  if (
    (await overLimit(db, `resend:ip:${ipHash}`, 3, 3600)) ||
    (await overLimit(db, `resend:email:${emailKey(email)}`, 3, 3600))
  )
    return { ok: false, message: TOO_MANY };
  if (!(await turnstileOk(formData, ip))) return { ok: false, message: SPAM_FAILED };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) console.error("Resend failed:", error.code);
  return {
    ok: true,
    message:
      "If that email is waiting to be verified, we sent a new link. Check your inbox and spam folder.",
  };
}

// ---------- Forgot and reset password ----------

export async function forgotPasswordAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!supabaseAuthConfigured()) return { ok: false, message: NOT_SET_UP };
  const { db, ip, ipHash } = await context();
  const parsed = emailOnlySchema.safeParse(formValues(formData));
  if (!parsed.success)
    return {
      ok: false,
      message: "Please enter a full email address.",
      errors: fieldErrors(parsed.error),
    };
  const { email } = parsed.data;

  if (
    (await overLimit(db, `forgot:ip:${ipHash}`, 3, 3600)) ||
    (await overLimit(db, `forgot:email:${emailKey(email)}`, 3, 3600))
  )
    return { ok: false, message: TOO_MANY };
  if (!(await turnstileOk(formData, ip))) return { ok: false, message: SPAM_FAILED };

  // The link in the email goes to /auth/confirm (set in the Supabase "Reset password" template).
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) console.error("Reset email failed:", error.code);
  return {
    ok: true,
    message:
      "If an account exists for that email, we sent a link. Check your inbox and spam folder.",
  };
}

// The person opened the email link, so /auth/confirm already gave them a short login. Now they pick a new password.
export async function resetPasswordAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!supabaseAuthConfigured()) return { ok: false, message: NOT_SET_UP };
  const { db, ipHash } = await context();

  const session = await getSession();
  if (!session)
    return { ok: false, message: "This link has ended. Please ask for a new password link." };

  const parsed = resetPasswordSchema.safeParse(formValues(formData));
  if (!parsed.success)
    return {
      ok: false,
      message: "Please check the form.",
      errors: fieldErrors(parsed.error),
    };
  if (await overLimit(db, `reset:ip:${ipHash}`, 10, 3600)) return { ok: false, message: TOO_MANY };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password")
      return {
        ok: false,
        message: "Please check the form.",
        errors: { password: "Choose a password you have not used before." },
      };
    if (error.code === "weak_password")
      return {
        ok: false,
        message: "Please check the form.",
        errors: { password: "That password is too easy to guess. Try a longer phrase." },
      };
    console.error("Password update failed:", error.code);
    return { ok: false, message: GENERIC_FAIL };
  }
  // A new password ends every other login of this account.
  await supabase.auth.signOut({ scope: "others" });

  const profile = await ensureProfile(db, session);
  await logAuthEvent(db, {
    action: "auth.password_reset",
    userId: profile.id,
    isAdmin: isPanelRole(profile.role),
    ipHash,
  });
  redirect(landingPathFor(profile.role));
}
