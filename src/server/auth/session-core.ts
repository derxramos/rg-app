import "server-only";

// The core of the user session checks. No cookies and no Supabase here, so it is easy to test.
// Order of checks (docs/AUTH_AND_ROLES.md): 1. a valid session  2. a profile row  3. a verified email (when needed).
// The role is ALWAYS read from the profiles table. It is never taken from the token or the browser.

import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { profiles } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export type Profile = typeof profiles.$inferSelect;

export type UserSession = {
  userId: string;
  email: string;
  // Only the development test login is trusted to say "verified" without asking Supabase.
  source: "supabase" | "dev";
  // The Supabase session id (from the token claims). Used to find out when a session started.
  sessionId?: string | null;
};

export type UserAuthCode = "no-session" | "not-verified" | "turned-off";

export class UserAuthError extends Error {
  constructor(public code: UserAuthCode) {
    super(code);
  }
}

// Finds the profile. If the sign-up trigger did not make one (it only logs a warning when it fails),
// make it now, as a plain "user". A role is never set here.
export async function ensureProfile(db: AppDb, session: UserSession): Promise<Profile> {
  const find = async () =>
    (await db.select().from(profiles).where(eq(profiles.id, session.userId)).limit(1))[0];
  const existing = await find();
  if (existing) return existing;
  await db
    .insert(profiles)
    .values({ id: session.userId, email: session.email })
    .onConflictDoNothing();
  const created = await find();
  if (!created) throw new UserAuthError("no-session");
  return created;
}

export async function checkUser(
  db: AppDb,
  session: UserSession | null,
  options: { emailVerified?: boolean } = {},
): Promise<Profile> {
  if (!session) throw new UserAuthError("no-session");
  const profile = await ensureProfile(db, session);
  // A turned-off account is blocked at once, even if the session is still valid.
  if (!profile.isActive) throw new UserAuthError("turned-off");
  if (options.emailVerified === false) throw new UserAuthError("not-verified");
  return profile;
}

// ---------- Development test login ----------
// Lets pages for logged-in users be tried and tested on a computer with no Supabase account.
// It works ONLY when NODE_ENV is "development" (never in a build or in production), only for an email
// that is listed in DEV_USER_BYPASS_EMAILS, and only for the reserved test pattern zolb-test+...@example.com.
export const DEV_USER_COOKIE = "rg_dev_user";
// The cookie value that means "signed out on purpose". It stops the dev admin bypass from signing you in again.
export const DEV_SIGNED_OUT = "none";

export function isDevSignedOut(env: { nodeEnv?: string; cookie?: string }): boolean {
  return env.nodeEnv === "development" && env.cookie === DEV_SIGNED_OUT;
}
const TEST_EMAIL = /^zolb-test\+[a-z0-9._-]+@example\.com$/i;

export function isTestEmail(email: string): boolean {
  return TEST_EMAIL.test(email);
}

// A fixed id made from the email, so the same test email is always the same test user.
export function devUserId(email: string): string {
  const hex = createHash("sha256").update(`dev-user:${email.toLowerCase()}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function devUserSession(env: {
  nodeEnv?: string;
  allowList?: string;
  cookie?: string;
}): UserSession | null {
  if (env.nodeEnv !== "development") return null;
  const email = env.cookie?.trim().toLowerCase();
  if (!email || !isTestEmail(email)) return null;
  const allowed = (env.allowList ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(email)) return null;
  return { userId: devUserId(email), email, source: "dev" };
}

// ---------- Run a query as the logged-in user, so Row Level Security applies ----------
// Inside one transaction: tell the database who the user is (the same setting Supabase uses), then switch
// to the "authenticated" role. The role has read rights only on the user's own rows (drizzle/0003).
// Use explicit column lists in these queries: the private columns are hidden from this role.
export async function runAsUser<T>(
  db: AppDb,
  userId: string,
  run: (tx: Parameters<Parameters<AppDb["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return run(tx);
  });
}
