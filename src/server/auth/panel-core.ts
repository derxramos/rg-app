import "server-only";

// The core of admin area ("panel") access checks. No cookies and no Supabase here, so it is easy to test.
// requirePanel checks, in this order (docs/AUTH_AND_ROLES.md):
//   1. a valid session   2. AAL2 (password + 2FA code, skipped only while ADMIN_REQUIRE_2FA=false)
//   3. the account exists and is turned on   4. the role is staff, admin or owner
//   5. no temporary password   6. no pending 2-step reset   7. the session is not older than a "sign out everywhere"
//   8. the role may do the needed action (src/lib/permissions.ts)

import { eq } from "drizzle-orm";

import {
  can,
  isPanelRole,
  landingPathForRole,
  type Action,
  type PanelRole,
  type Role,
} from "@/lib/permissions";
import { safeNextPath } from "@/lib/safe-next";
import { activityLog, profiles } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { hmacHex, safeEqual } from "@/server/security/tokens";

export type { PanelRole } from "@/lib/permissions";

// The person using the admin area. It comes from the profiles table.
export type PanelUser = {
  id: string;
  fullName: string;
  email: string;
  role: PanelRole;
  isActive: boolean;
};

export type PanelSession = {
  userId: string;
  email: string;
  // aal1 = password only. aal2 = password and a 2FA code.
  aal: "aal1" | "aal2";
  // The Supabase session id (from the token). Used to find when the session started.
  sessionId?: string | null;
  // When this login session started (milliseconds). Used with profiles.sessions_revoked_at.
  // Undefined = look it up (only needed after a "sign out everywhere"). A development login is always "new".
  startedAt?: number | null;
};

export type PanelAuthCode =
  | "no-session"
  | "needs-2fa"
  | "not-admin"
  | "inactive"
  | "wrong-role"
  | "needs-fresh-2fa"
  | "must-change-password"
  | "needs-mfa-setup"
  | "session-revoked";

export class PanelAuthError extends Error {
  constructor(public code: PanelAuthCode) {
    super(code);
  }
}

export async function checkPanel(
  db: AppDb,
  session: PanelSession | null,
  options: {
    action?: Action;
    twoFactorRequired?: boolean;
    // Finds when a session started. Called only when the account has a "sign out everywhere" mark.
    lookupSessionStart?: (sessionId: string) => Promise<number | null>;
  } = {},
): Promise<PanelUser> {
  if (!session) throw new PanelAuthError("no-session");
  // The flag skips ONLY this one check. Every check below always runs. If the caller says nothing,
  // 2FA is required (the safe default).
  const twoFactorRequired = options.twoFactorRequired ?? true;
  if (twoFactorRequired && session.aal !== "aal2") {
    throw new PanelAuthError("needs-2fa");
  }

  const [account] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, session.userId))
    .limit(1);
  if (!account) throw new PanelAuthError("not-admin");
  // Turning an account off blocks it at once, even if the session is still valid.
  if (!account.isActive) throw new PanelAuthError("inactive");
  // The role always comes from the database, never from the browser or the token.
  if (!isPanelRole(account.role)) throw new PanelAuthError("not-admin");
  // An account made with a temporary password must choose its own password first.
  if (account.mustChangePassword) throw new PanelAuthError("must-change-password");
  // After another person reset the 2-step login, a new device and a backup device are needed first.
  // (Only while 2-step login is required. The setup pages themselves call this with twoFactorRequired false.)
  if (twoFactorRequired && account.mfaResetRequired) throw new PanelAuthError("needs-mfa-setup");
  // "Signed out everywhere": an older session is not accepted. Unknown start time = not accepted.
  if (account.sessionsRevokedAt) {
    let started = session.startedAt;
    if (started === undefined && session.sessionId && options.lookupSessionStart) {
      started = await options.lookupSessionStart(session.sessionId);
    }
    if ((started ?? 0) < account.sessionsRevokedAt.getTime())
      throw new PanelAuthError("session-revoked");
  }
  if (options.action && !can(account.role, options.action)) throw new PanelAuthError("wrong-role");

  return {
    id: account.id,
    fullName: account.fullName,
    email: account.email,
    role: account.role,
    isActive: account.isActive,
  };
}

// Writes a refused try to the activity log: who, which action, where (a page path, "server-action" or "route").
// Staff typing a hidden address, or replaying a form they may not use, leave a row the owner can see.
export async function recordDenied(
  db: AppDb,
  input: { actorId: string | null; action?: Action; where: string; ipHash?: string | null },
): Promise<void> {
  await db.insert(activityLog).values({
    actorType: "admin",
    actorId: input.actorId,
    action: "access.denied",
    entityType: "page",
    entityId: input.where,
    details: { action: input.action ?? null },
    ipHash: input.ipHash ?? null,
  });
}

// Used by services as a second check (CLAUDE.md rule 5: every layer checks).
export function assertCan(actor: { role: Role }, action: Action): void {
  if (!can(actor.role, action)) throw new PanelAuthError("wrong-role");
}

// ---------- Where to send people ----------
// Pure functions (no cookies), so the 2FA on / off paths are easy to test.

// A page guard failed. Where does the person go?
export function panelFailureRedirect(code: PanelAuthCode): string {
  switch (code) {
    case "no-session":
    case "session-revoked":
      return "/login?next=%2Fadmin&reason=expired";
    case "needs-2fa":
    case "needs-fresh-2fa":
      return "/admin/mfa";
    case "needs-mfa-setup":
      return "/admin/mfa/setup";
    case "must-change-password":
      return "/account/change-password";
    case "wrong-role":
      return "/admin/not-allowed?reason=role";
    case "not-admin":
    case "inactive":
      // Signed in, but not an (active) panel account: show the "Not allowed" page, not the login page.
      return "/admin/not-allowed";
  }
}

// Right after a good password. Clients are never asked for 2FA. A panel account is asked only while 2FA is required.
export function afterLoginDestination(input: {
  role: Role;
  isActive: boolean;
  twoFactorRequired: boolean;
  hasVerifiedFactor: boolean;
  mfaResetRequired?: boolean;
  next: string | null | undefined;
}): string {
  const isPanel = isPanelRole(input.role) && input.isActive;
  if (isPanel && input.twoFactorRequired) {
    return input.hasVerifiedFactor && !input.mfaResetRequired ? "/admin/mfa" : "/admin/mfa/setup";
  }
  return safeNextPath(input.next, landingPathForRole(isPanel ? input.role : "user"));
}

// ---------- Development bypass ----------
// Lets the admin area be tried on a computer with no Supabase account. It works ONLY when
// NODE_ENV is "development" (never in a build or in production), and only for the email in
// DEV_ADMIN_BYPASS_EMAIL. That email must still have a profile with a panel role.
export function devBypassSession(env: { nodeEnv?: string; email?: string }): PanelSession | null {
  if (env.nodeEnv !== "development" || !env.email?.trim()) return null;
  return {
    userId: "dev-bypass",
    email: env.email.trim(),
    aal: "aal2",
    startedAt: Number.MAX_SAFE_INTEGER,
  };
}

// ---------- Is 2FA required? ----------
// The rule lives in src/lib/two-factor-flag.ts (so the startup hook can use it). Re-exported here.
export { isTwoFactorRequired } from "@/lib/two-factor-flag";

// ---------- Fresh 2FA ----------
// Risky actions (changing a QR, account details, accounts) need a confirm typed in the last
// 5 minutes. After a good confirm the server sets a short signed cookie that says "fresh until ...".
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
