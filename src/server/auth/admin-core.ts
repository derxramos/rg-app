import "server-only";

// The core of admin access checks. No cookies and no Supabase here, so it is easy to test.
// requireAdmin checks, in this order (docs/ARCHITECTURE.md section 5):
//   1. a valid session   2. AAL2 (password + 2FA code, skipped only while ADMIN_REQUIRE_2FA=false)
//   3. an active admin_profiles row   4. profiles.role = "admin"   5. the needed owner/staff level

import { eq } from "drizzle-orm";

import { landingPathFor, safeNextPath } from "@/lib/safe-next";
import { adminProfiles, profiles } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { hmacHex, safeEqual } from "@/server/security/tokens";

export type AdminRole = "owner" | "staff";
export type AdminProfile = typeof adminProfiles.$inferSelect;

export type AdminSession = {
  userId: string;
  email: string;
  // aal1 = password only. aal2 = password and a 2FA code.
  aal: "aal1" | "aal2";
};

export type AdminAuthCode =
  | "no-session"
  | "needs-2fa"
  | "not-admin"
  | "inactive"
  | "wrong-role"
  | "needs-fresh-2fa"
  | "must-change-password";

export class AdminAuthError extends Error {
  constructor(public code: AdminAuthCode) {
    super(code);
  }
}

// Who may do what. Kept in one place, so an owner decision changes one line.
// Only the OWNER verifies or rejects payments (decided by the owner). One line to change.
export const PAYMENT_VERIFY_ROLES: readonly AdminRole[] = ["owner"];
// Payment methods, admin users and CSV export are owner only (docs/FEATURES.md A6, A9, A11).
export const OWNER_ONLY: readonly AdminRole[] = ["owner"];

export function hasRole(profile: AdminProfile, roles: readonly AdminRole[]): boolean {
  return roles.includes(profile.role);
}

export async function checkAdmin(
  db: AppDb,
  session: AdminSession | null,
  options: { roles?: readonly AdminRole[]; twoFactorRequired?: boolean } = {},
): Promise<AdminProfile> {
  if (!session) throw new AdminAuthError("no-session");
  // The flag skips ONLY this one check. Every check below always runs. If the caller says nothing,
  // 2FA is required (the safe default).
  if ((options.twoFactorRequired ?? true) && session.aal !== "aal2") {
    throw new AdminAuthError("needs-2fa");
  }

  const [profile] = await db
    .select()
    .from(adminProfiles)
    .where(eq(adminProfiles.id, session.userId))
    .limit(1);
  if (!profile) throw new AdminAuthError("not-admin");
  // Turning an account off blocks it at once, even if the session is still valid.
  if (!profile.isActive) throw new AdminAuthError("inactive");
  // The account role must ALSO be "admin" (profiles table). Two separate records must agree, so a
  // mistake in one place does not make someone an admin. This check runs even when 2FA is off.
  const [account] = await db
    .select({ role: profiles.role, mustChangePassword: profiles.mustChangePassword })
    .from(profiles)
    .where(eq(profiles.id, session.userId))
    .limit(1);
  if (account?.role !== "admin") throw new AdminAuthError("not-admin");
  // An admin made with a temporary password must choose their own password first.
  if (account.mustChangePassword) throw new AdminAuthError("must-change-password");
  if (options.roles && !hasRole(profile, options.roles)) throw new AdminAuthError("wrong-role");
  return profile;
}

// ---------- Where to send people ----------
// Pure functions (no cookies), so the 2FA on / off paths are easy to test.

// A page guard failed. Where does the person go?
export function adminFailureRedirect(code: AdminAuthCode): string {
  switch (code) {
    case "no-session":
      return "/login?next=%2Fadmin&reason=expired";
    case "needs-2fa":
    case "needs-fresh-2fa":
      return "/admin/mfa";
    case "must-change-password":
      return "/account/change-password";
    case "wrong-role":
      return "/admin?denied=1";
    case "not-admin":
    case "inactive":
      // Signed in, but not an (active) admin: show the "Not allowed" page, not the login page.
      return "/admin/not-allowed";
  }
}

// Right after a good password. Users are never asked for 2FA. An admin is asked only while 2FA is required.
export function afterLoginDestination(input: {
  isActiveAdmin: boolean;
  twoFactorRequired: boolean;
  hasVerifiedFactor: boolean;
  next: string | null | undefined;
}): string {
  if (input.isActiveAdmin && input.twoFactorRequired) {
    return input.hasVerifiedFactor ? "/admin/mfa" : "/admin/mfa/setup";
  }
  return safeNextPath(input.next, landingPathFor(input.isActiveAdmin ? "admin" : "user"));
}

// ---------- Development bypass ----------
// Lets the admin area be tried on a computer with no Supabase account. It works ONLY when
// NODE_ENV is "development" (never in a build or in production), and only for the email in
// DEV_ADMIN_BYPASS_EMAIL. That email must still have an active admin_profiles row.
export function devBypassSession(env: { nodeEnv?: string; email?: string }): AdminSession | null {
  if (env.nodeEnv !== "development" || !env.email?.trim()) return null;
  return { userId: "dev-bypass", email: env.email.trim(), aal: "aal2" };
}

// ---------- Is 2FA required? ----------
// The rule lives in src/lib/two-factor-flag.ts (so the startup hook can use it). Re-exported here.
export { isTwoFactorRequired } from "@/lib/two-factor-flag";

// ---------- Fresh 2FA ----------
// Risky actions (changing a QR, account details, admin users) need a 6-digit code typed in the last
// 5 minutes. After a good code the server sets a short signed cookie that says "fresh until ...".
export const FRESH_2FA_SECONDS = 5 * 60;

export function makeFresh2faValue(secret: string, userId: string, nowMs: number): string {
  const expires = nowMs + FRESH_2FA_SECONDS * 1000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${hmacHex(secret, `fresh:${payload}`)}`;
}

export function isFresh2faValid(
  secret: string,
  userId: string,
  value: string | undefined,
  nowMs: number,
): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [cookieUser, expires, signature] = parts;
  if (cookieUser !== userId) return false;
  if (!safeEqual(signature, hmacHex(secret, `fresh:${cookieUser}.${expires}`))) return false;
  return Number(expires) > nowMs;
}
