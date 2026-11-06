import "server-only";

// The core of admin access checks. No cookies and no Supabase here, so it is easy to test.
// requireAdmin checks, in this order (docs/ARCHITECTURE.md section 5):
//   1. a valid session   2. AAL2 (password + 2FA code)   3. an active admin_profiles row   4. the needed role

import { eq } from "drizzle-orm";

import { adminProfiles } from "@/server/db/schema";
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
  "no-session" | "needs-2fa" | "not-admin" | "inactive" | "wrong-role" | "needs-fresh-2fa";

export class AdminAuthError extends Error {
  constructor(public code: AdminAuthCode) {
    super(code);
  }
}

// Who may do what. Kept in one place, so an owner decision changes one line.
// OPEN QUESTION (PROGRESS.md): can staff verify payments? For now both roles can,
// because the design shows Verify to everyone who sees the request.
export const PAYMENT_VERIFY_ROLES: readonly AdminRole[] = ["owner", "staff"];
// Payment methods, admin users and CSV export are owner only (docs/FEATURES.md A6, A9, A11).
export const OWNER_ONLY: readonly AdminRole[] = ["owner"];

export function hasRole(profile: AdminProfile, roles: readonly AdminRole[]): boolean {
  return roles.includes(profile.role);
}

export async function checkAdmin(
  db: AppDb,
  session: AdminSession | null,
  options: { roles?: readonly AdminRole[] } = {},
): Promise<AdminProfile> {
  if (!session) throw new AdminAuthError("no-session");
  if (session.aal !== "aal2") throw new AdminAuthError("needs-2fa");

  const [profile] = await db
    .select()
    .from(adminProfiles)
    .where(eq(adminProfiles.id, session.userId))
    .limit(1);
  if (!profile) throw new AdminAuthError("not-admin");
  // Turning an account off blocks it at once, even if the session is still valid.
  if (!profile.isActive) throw new AdminAuthError("inactive");
  if (options.roles && !hasRole(profile, options.roles)) throw new AdminAuthError("wrong-role");
  return profile;
}

// ---------- Development bypass ----------
// Lets the admin area be tried on a computer with no Supabase account. It works ONLY when
// NODE_ENV is "development" (never in a build or in production), and only for the email in
// DEV_ADMIN_BYPASS_EMAIL. That email must still have an active admin_profiles row.
export function devBypassSession(env: { nodeEnv?: string; email?: string }): AdminSession | null {
  if (env.nodeEnv !== "development" || !env.email?.trim()) return null;
  return { userId: "dev-bypass", email: env.email.trim(), aal: "aal2" };
}

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
