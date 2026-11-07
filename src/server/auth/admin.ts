import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/server/db/client";
import { getTokenSecret, isProduction } from "@/server/env";
import { hashIp, readClientIp } from "@/server/security/client-ip";

import {
  AdminAuthError,
  adminFailureRedirect,
  checkAdmin,
  devBypassSession,
  isFresh2faValid,
  isTwoFactorRequired,
  makeFresh2faValue,
  FRESH_2FA_SECONDS,
  type AdminAuthCode,
  type AdminProfile,
  type AdminRole,
  type AdminSession,
} from "./admin-core";
import { getSession } from "./session";
import { createSupabaseServer, supabaseAuthConfigured } from "./supabase-server";

const FRESH_COOKIE = "rg_fresh2fa";

// Who is logged in? One place decides (getSession in session.ts): the development test login, "signed out
// on purpose", the dev admin bypass, or a real Supabase login. For a real login we also ask Supabase
// (getUser asks the server, it does not just trust the cookie) and read the 2FA level.
export async function getAdminSession(): Promise<AdminSession | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.source === "dev") {
    return { userId: session.userId, email: session.email, aal: "aal2" };
  }

  if (!supabaseAuthConfigured()) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // The real level. Whether a password-only login is enough is decided in checkAdmin, not here.
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    aal: level?.currentLevel === "aal2" ? "aal2" : "aal1",
  };
}

// Called at the start of EVERY admin server action, route and page (CLAUDE.md rule 5).
export async function requireAdmin(
  options: { roles?: readonly AdminRole[] } = {},
): Promise<AdminProfile> {
  return checkAdmin(getDb(), await getAdminSession(), {
    ...options,
    // With ADMIN_REQUIRE_2FA=false only the 2FA code step is skipped. All other checks still run.
    twoFactorRequired: isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA),
  });
}

// For pages: sends the person where they can fix it instead of showing an error.
export async function guardAdminPage(
  options: { roles?: readonly AdminRole[] } = {},
): Promise<AdminProfile> {
  let profile: AdminProfile | null = null;
  let failure: AdminAuthCode | null = null;
  try {
    profile = await requireAdmin(options);
  } catch (error) {
    if (!(error instanceof AdminAuthError)) throw error;
    failure = error.code;
  }
  if (profile) return profile;
  redirect(adminFailureRedirect(failure ?? "no-session"));
}

// For the 2FA code pages and their actions. The person must be a signed-in, active admin (the password step
// is done), but has NOT passed 2FA yet, so requireAdmin cannot be used. If not: AdminAuthError.
export async function requireAdminPendingMfa(): Promise<AdminSession> {
  const session = await getAdminSession();
  await checkAdmin(getDb(), session, { twoFactorRequired: false });
  return session as AdminSession;
}

// For the 2FA pages. Sends people who do not belong there somewhere useful, and says whether a verified
// authenticator app already exists.
export async function guardMfaPage(): Promise<{ hasVerifiedFactor: boolean }> {
  let session: AdminSession | null = null;
  let failure: AdminAuthCode | null = null;
  try {
    session = await requireAdminPendingMfa();
  } catch (error) {
    if (!(error instanceof AdminAuthError)) throw error;
    failure = error.code;
  }
  if (!session) redirect(adminFailureRedirect(failure ?? "no-session"));
  // Nothing to do while 2FA is off, or after the code was already accepted.
  if (!isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA) || session.aal === "aal2") {
    redirect("/admin");
  }
  if (!supabaseAuthConfigured()) return { hasVerifiedFactor: false };
  const supabase = await createSupabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return { hasVerifiedFactor: Boolean(factors?.totp.some((f) => f.status === "verified")) };
}

// ---------- Fresh 2FA ----------

export async function hasFresh2fa(adminId: string): Promise<boolean> {
  // With 2FA switched off there is no code to ask for. The owner-only rule, the activity log and the
  // alert email still protect payment methods.
  if (!isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA)) return true;
  const jar = await cookies();
  return isFresh2faValid(getTokenSecret(), adminId, jar.get(FRESH_COOKIE)?.value, Date.now());
}

async function markFresh(adminId: string) {
  const jar = await cookies();
  jar.set(FRESH_COOKIE, makeFresh2faValue(getTokenSecret(), adminId, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/admin",
    maxAge: FRESH_2FA_SECONDS,
  });
}

// Checks a 6-digit code against the admin's authenticator app. In development with the bypass, the
// code 000000 is accepted so the pages can be tried.
export async function verifyFresh2fa(admin: AdminProfile, code: string): Promise<boolean> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;

  const bypass = devBypassSession({
    nodeEnv: process.env.NODE_ENV,
    email: process.env.DEV_ADMIN_BYPASS_EMAIL,
  });
  if (bypass) {
    if (clean !== "000000") return false;
    await markFresh(admin.id);
    return true;
  }

  const supabase = await createSupabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return false;
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: clean,
  });
  if (error) return false;
  await markFresh(admin.id);
  return true;
}

// ---------- Server action wrapper ----------

export type ActionResult =
  | { ok: true; message?: string }
  | {
      ok: false;
      message: string;
      code?: AdminAuthCode | "invalid";
      errors?: Record<string, string>;
    };

export type AdminContext = { admin: AdminProfile; ipHash: string; fresh2fa: boolean };

const MESSAGES: Record<AdminAuthCode, string> = {
  "no-session": "Please log in again.",
  "needs-2fa": "Please enter your 2FA code to continue.",
  "not-admin": "This account is not allowed here.",
  inactive: "This account is turned off.",
  "wrong-role": "Only the owner can do this.",
  "needs-fresh-2fa":
    "Please type a fresh 6-digit code from your authenticator app, then try again.",
};

// Wraps an admin Server Action: checks access FIRST (not just the page), reads the fresh 2FA state, turns
// "not allowed" errors into messages, and keeps strange errors out of the browser.
// If the form has a "fresh2faCode" field, that code is checked and starts a 5 minute fresh period.
export async function withAdmin(
  options: { roles?: readonly AdminRole[]; formData?: FormData },
  run: (context: AdminContext) => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin({ roles: options.roles });
    const code = options.formData?.get("fresh2faCode");
    if (typeof code === "string" && code.trim()) await verifyFresh2fa(admin, code);
    const ipHash = hashIp(readClientIp(await headers()));
    return await run({ admin, ipHash, fresh2fa: await hasFresh2fa(admin.id) });
  } catch (error) {
    if (error instanceof AdminAuthError)
      return { ok: false, code: error.code, message: MESSAGES[error.code] };
    // Our own "please fix this" errors carry a safe message and a code.
    const known = error as { code?: string; message?: string; name?: string };
    if (
      known &&
      typeof known.code === "string" &&
      [
        "slug-taken",
        "not-found",
        "in-use",
        "invalid",
        "exists",
        "last-owner",
        "self",
        "confirm-needed",
        "not-pending",
        "reason-needed",
        "status-not-allowed",
      ].includes(known.code)
    ) {
      return { ok: false, code: "invalid", message: known.message ?? "That could not be done." };
    }
    if (known?.name === "ZodError")
      return {
        ok: false,
        code: "invalid",
        message: "Please check the values. One of them is not allowed.",
      };
    console.error("Admin action failed:", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
