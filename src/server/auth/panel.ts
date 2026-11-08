import "server-only";

import { sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type { Action } from "@/lib/permissions";
import { getDb } from "@/server/db/client";
import { rateLimit } from "@/server/security/rate-limit";
import { passwordIsRight } from "./reauth";
import { getTokenSecret, isProduction } from "@/server/env";
import { hashIp, readClientIp } from "@/server/security/client-ip";

import {
  FRESH_2FA_SECONDS,
  PanelAuthError,
  checkPanel,
  devBypassSession,
  isFresh2faValid,
  isTwoFactorRequired,
  makeFresh2faValue,
  panelFailureRedirect,
  type PanelAuthCode,
  type PanelSession,
  type PanelUser,
} from "./panel-core";
import { getSession } from "./session";
import { createSupabaseServer, supabaseAuthConfigured } from "./supabase-server";

const FRESH_COOKIE = "rg_fresh2fa";

// postgres-js returns the rows as an array, PGlite as { rows }. Handle both.
function rowsOf(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[];
}

// When did this Supabase login session start? Read from auth.sessions (our server may read it).
// Used only after a "sign out everywhere". Any problem gives 0 = "unknown", which counts as old.
async function lookupSessionStart(sessionId: string): Promise<number | null> {
  try {
    const result = await getDb().execute(
      sql`select created_at from auth.sessions where id = ${sessionId}::uuid`,
    );
    const created = rowsOf(result)[0]?.created_at;
    return created ? new Date(created as string | Date).getTime() : 0;
  } catch {
    return 0;
  }
}

// Who is logged in? One place decides (getSession in session.ts): the development test login, "signed out
// on purpose", the dev admin bypass, or a real Supabase login. For a real login we also ask Supabase
// (getUser asks the server, it does not just trust the cookie) and read the 2FA level.
export async function getPanelSession(): Promise<PanelSession | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.source === "dev") {
    return {
      userId: session.userId,
      email: session.email,
      aal: "aal2",
      startedAt: Number.MAX_SAFE_INTEGER,
    };
  }

  if (!supabaseAuthConfigured()) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // The real level. Whether a password-only login is enough is decided in checkPanel, not here.
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    aal: level?.currentLevel === "aal2" ? "aal2" : "aal1",
    sessionId: session.sessionId ?? null,
  };
}

// Called at the start of EVERY admin server action, route and page (CLAUDE.md rule 5).
// `action` is the thing the person wants to do. The role table in src/lib/permissions.ts decides.
export async function requirePanel(action?: Action): Promise<PanelUser> {
  return checkPanel(getDb(), await getPanelSession(), {
    action,
    // With ADMIN_REQUIRE_2FA=false only the 2FA code step is skipped. All other checks still run.
    twoFactorRequired: isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA),
    lookupSessionStart,
  });
}

// Writes the refused try to the activity log, so the owner can see it (staff typing a hidden address).
async function logDenied(actorId: string | null, action: Action | undefined, where: string) {
  try {
    const ipHash = hashIp(readClientIp(await headers()));
    await getDb().execute(
      sql`insert into activity_log (actor_type, actor_id, action, entity_type, entity_id, details, ip_hash)
          values ('admin', ${actorId}, 'access.denied', 'page', ${where}, ${JSON.stringify({ action: action ?? null })}::jsonb, ${ipHash})`,
    );
  } catch (error) {
    console.error("Could not log a refused try:", error);
  }
}

// For pages: sends the person where they can fix it instead of showing an error.
// A wrong role goes to "not allowed" and is written to the activity log.
export async function guardPanelPage(action?: Action, where = "/admin"): Promise<PanelUser> {
  let user: PanelUser | null = null;
  let failure: PanelAuthCode | null = null;
  try {
    user = await requirePanel(action);
  } catch (error) {
    if (!(error instanceof PanelAuthError)) throw error;
    failure = error.code;
  }
  if (user) return user;
  if (failure === "wrong-role") {
    const session = await getPanelSession();
    await logDenied(session?.userId ?? null, action, where);
  }
  redirect(panelFailureRedirect(failure ?? "no-session"));
}

// For the 2FA code pages and their actions. The person must be a signed-in, active panel account (the
// password step is done), but has NOT passed 2FA yet, so requirePanel cannot be used. If not: PanelAuthError.
export async function requirePanelPendingMfa(): Promise<PanelSession> {
  const session = await getPanelSession();
  await checkPanel(getDb(), session, { twoFactorRequired: false, lookupSessionStart });
  return session as PanelSession;
}

// The same for the Security page and its actions: the person must be fully signed in (2FA passed if required)
// and may use their own devices. Does not ask for the pending reset (the page is how they finish it).
export async function requireSecurityUser(): Promise<PanelUser> {
  return checkPanel(getDb(), await getPanelSession(), {
    action: "security.self",
    twoFactorRequired: isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA),
    lookupSessionStart,
  });
}

// For the 2FA pages. Sends people who do not belong there somewhere useful, and says whether a verified
// authenticator app already exists.
export async function guardMfaPage(): Promise<{ hasVerifiedFactor: boolean; factorCount: number }> {
  let session: PanelSession | null = null;
  let failure: PanelAuthCode | null = null;
  try {
    session = await requirePanelPendingMfa();
  } catch (error) {
    if (!(error instanceof PanelAuthError)) throw error;
    failure = error.code;
  }
  if (!session) redirect(panelFailureRedirect(failure ?? "no-session"));
  // Nothing to do while 2FA is off, or after the code was already accepted.
  if (!isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA) || session.aal === "aal2") {
    redirect("/admin");
  }
  if (!supabaseAuthConfigured()) return { hasVerifiedFactor: false, factorCount: 0 };
  const supabase = await createSupabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.filter((f) => f.status === "verified") ?? [];
  return { hasVerifiedFactor: verified.length > 0, factorCount: verified.length };
}

// ---------- Fresh confirm ("step-up") ----------
// Risky actions need a fresh confirm in the last 5 minutes. It is ALWAYS the confirm of the person who
// does the action (never of the other account):
//   - "code": a 6-digit code from any of their authenticator devices, or
//   - "password": their own account password. Only when they have NO authenticator yet (this can happen only
//     while ADMIN_REQUIRE_2FA=false, because with the flag on the login forces the setup).
// The flag never removes the confirm. It only decides whether people must have an authenticator.

export type StepUpMode = "code" | "password";

export async function getStepUpMode(): Promise<StepUpMode> {
  const session = await getSession();
  if (!session || session.source === "dev") return "code"; // the development test code is 000000
  if (!supabaseAuthConfigured()) return "password";
  const supabase = await createSupabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return factors?.totp.some((f) => f.status === "verified") ? "code" : "password";
}

export async function hasFresh2fa(userId: string): Promise<boolean> {
  const jar = await cookies();
  return isFresh2faValid(getTokenSecret(), userId, jar.get(FRESH_COOKIE)?.value, Date.now());
}

async function markFresh(userId: string) {
  const jar = await cookies();
  jar.set(FRESH_COOKIE, makeFresh2faValue(getTokenSecret(), userId, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/admin",
    maxAge: FRESH_2FA_SECONDS,
  });
}

// Checks a 6-digit code against the person's authenticator apps (any verified device works, so a backup
// phone is enough). In development with the bypass, the code 000000 is accepted so the pages can be tried.
export async function verifyFresh2fa(user: PanelUser, code: string): Promise<boolean> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;

  const bypass = devBypassSession({
    nodeEnv: process.env.NODE_ENV,
    email: process.env.DEV_ADMIN_BYPASS_EMAIL,
  });
  if (bypass) {
    if (clean !== "000000") return false;
    await markFresh(user.id);
    return true;
  }

  const supabase = await createSupabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.totp.filter((f) => f.status === "verified") ?? []) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: clean,
    });
    if (!error) {
      await markFresh(user.id);
      return true;
    }
  }
  return false;
}

// Reads the confirm fields of a form (fresh2faCode or confirmPassword) and, if right, starts the fresh period.
// Wrong tries are rate limited (5 per 15 minutes) so a stolen open browser cannot guess a code or password.
async function applyStepUp(user: PanelUser, formData: FormData | undefined): Promise<void> {
  const code = String(formData?.get("fresh2faCode") ?? "").trim();
  const password = String(formData?.get("confirmPassword") ?? "");
  if (!code && !password) return;

  const limit = await rateLimit(getDb(), {
    key: `stepup:${user.id}`,
    limit: 5,
    windowSeconds: 15 * 60,
  });
  if (!limit.allowed) return;

  if (code) {
    await verifyFresh2fa(user, code);
    return;
  }
  // The password only counts when the person has no authenticator (otherwise a code is needed).
  if ((await getStepUpMode()) !== "password") return;
  const session = await getSession();
  if (session && (await passwordIsRight(session, password))) await markFresh(user.id);
}

// ---------- Server action wrapper ----------

export type ActionResult =
  | { ok: true; message?: string }
  | {
      ok: false;
      message: string;
      code?: PanelAuthCode | "invalid";
      errors?: Record<string, string>;
    };

export type PanelContext = { admin: PanelUser; ipHash: string; fresh2fa: boolean };

const MESSAGES: Record<PanelAuthCode, string> = {
  "no-session": "Please log in again.",
  "needs-2fa": "Please enter your 2FA code to continue.",
  "not-admin": "This account is not allowed here.",
  inactive: "This account is turned off.",
  "wrong-role": "You are not allowed to do this.",
  "needs-fresh-2fa":
    "Please type a fresh 6-digit code from your authenticator app, then try again.",
  "must-change-password": "Please choose your own password first (My account > Change password).",
  "needs-mfa-setup": "Please set up your authenticator app and a backup device first.",
  "session-revoked": "Your session was ended. Please log in again.",
};

// Wraps an admin Server Action: checks access FIRST (not just the page), reads the fresh 2FA state, turns
// "not allowed" errors into messages, and keeps strange errors out of the browser.
// `action` is the name from the role table (src/lib/permissions.ts). A refused role is written to the activity log.
// If the form has a "fresh2faCode" field, that code is checked and starts a 5 minute fresh period.
export async function withPanel(
  options: { action: Action; formData?: FormData },
  run: (context: PanelContext) => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    const admin = await requirePanel(options.action);
    await applyStepUp(admin, options.formData);
    const ipHash = hashIp(readClientIp(await headers()));
    return await run({ admin, ipHash, fresh2fa: await hasFresh2fa(admin.id) });
  } catch (error) {
    if (error instanceof PanelAuthError) {
      if (error.code === "wrong-role") {
        const session = await getPanelSession().catch(() => null);
        await logDenied(session?.userId ?? null, options.action, "server-action");
      }
      return { ok: false, code: error.code, message: MESSAGES[error.code] };
    }
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
        "owner-only",
        "last-device",
        "same-device",
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
