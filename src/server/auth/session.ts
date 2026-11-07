import "server-only";

// The Data Access Layer for logged-in people (Next.js authentication guide): ONE place that answers
// "who is this, and what may they do?". Pages, Server Actions and Route Handlers all call it, because
// a page check does not protect a Server Action (it can be called with a direct POST request).
// Admin checks are in admin.ts (requireAdmin).

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { loginUrlFor } from "@/lib/safe-next";
import { getDb } from "@/server/db/client";
import { adminProfiles } from "@/server/db/schema";
import { hashIp, readClientIp } from "@/server/security/client-ip";

import { devBypassSession } from "./admin-core";
import {
  DEV_USER_COOKIE,
  UserAuthError,
  checkUser,
  devUserSession,
  isDevSignedOut,
  ensureProfile,
  runAsUser,
  type Profile,
  type UserAuthCode,
  type UserSession,
} from "./session-core";
import { createSupabaseServer, supabaseAuthConfigured } from "./supabase-server";

// Who is logged in? Supabase checks the login cookie: getClaims() checks the token signature, it does not
// just trust the cookie. The result is shared by everything in the same request (React cache).
export const getSession = cache(async (): Promise<UserSession | null> => {
  await connection(); // depends on cookies, so it runs at request time
  const jar = await cookies();

  // Development only: a test user chosen with /api/dev-login (never active in a build or production).
  const devUser = devUserSession({
    nodeEnv: process.env.NODE_ENV,
    allowList: process.env.DEV_USER_BYPASS_EMAILS,
    cookie: jar.get(DEV_USER_COOKIE)?.value,
  });
  if (devUser) return devUser;

  // Development only: signed out on purpose (so the admin bypass below does not sign you in again).
  if (isDevSignedOut({ nodeEnv: process.env.NODE_ENV, cookie: jar.get(DEV_USER_COOKIE)?.value }))
    return null;

  // Development only: the existing admin bypass.
  const adminBypass = devBypassSession({
    nodeEnv: process.env.NODE_ENV,
    email: process.env.DEV_ADMIN_BYPASS_EMAIL,
  });
  if (adminBypass) {
    const [row] = await getDb()
      .select({ id: adminProfiles.id })
      .from(adminProfiles)
      .where(eq(adminProfiles.email, adminBypass.email))
      .limit(1);
    return row ? { userId: row.id, email: adminBypass.email, source: "dev" } : null;
  }

  if (!supabaseAuthConfigured()) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { userId: claims.sub, email: claims.email ?? "", source: "supabase" };
});

export type AuthContext = { session: UserSession; profile: Profile };

// Called at the start of every action, route and page for logged-in people (CLAUDE.md rule 5).
// Throws UserAuthError("no-session") when nobody is logged in.
export async function requireUser(): Promise<AuthContext> {
  const session = await getSession();
  const profile = await checkUser(getDb(), session);
  return { session: session as UserSession, profile };
}

// The same, and the email must be verified. Needed to send a request. Supabase is asked again
// (getUser reads email_confirmed_at from the server), so a stale token cannot skip this.
export async function requireVerifiedUser(): Promise<AuthContext> {
  const context = await requireUser();
  if (context.session.source === "supabase") {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    if (!data.user || data.user.id !== context.session.userId)
      throw new UserAuthError("no-session");
    if (!data.user.email_confirmed_at) throw new UserAuthError("not-verified");
  }
  return context;
}

// What the header shows. Role comes from the database, never from the browser.
export type Viewer =
  { kind: "visitor" } | { kind: "user" | "admin"; profile: Profile; email: string };

// Cached for the request: the header asks twice (desktop bar and phone menu), the database is asked once.
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getSession();
  if (!session) return { kind: "visitor" };
  const profile = await ensureProfile(getDb(), session);
  return { kind: profile.role, profile, email: session.email };
});

// For pages: sends the person where they can fix it instead of showing an error.
// `path` is where to come back to after login.
export async function guardUserPage(
  options: { path?: string; verified?: boolean } = {},
): Promise<AuthContext> {
  let context: AuthContext | null = null;
  let failure: UserAuthCode | null = null;
  try {
    context = await (options.verified ? requireVerifiedUser() : requireUser());
  } catch (error) {
    if (!(error instanceof UserAuthError)) throw error;
    failure = error.code;
  }
  if (context) return context;
  if (failure === "not-verified") redirect("/register/check-email");
  redirect(loginUrlFor(options.path ?? "/account", { expired: true }));
}

// Runs a read as the logged-in user, so database Row Level Security filters the rows as well.
export function withUserRls<T>(
  session: UserSession,
  run: Parameters<typeof runAsUser<T>>[2],
): Promise<T> {
  return runAsUser(getDb(), session.userId, run);
}

// ---------- Server action wrapper ----------

export type UserActionResult =
  | { ok: true; message?: string }
  | {
      ok: false;
      message: string;
      code?: UserAuthCode | "invalid";
      errors?: Record<string, string>;
    };

export type UserContext = AuthContext & { ipHash: string };

const MESSAGES: Record<UserAuthCode, string> = {
  "no-session": "Please sign in again.",
  "not-verified": "Please verify your email first. Check your inbox for our message.",
};

// Wraps a Server Action for logged-in people: checks access FIRST, turns "not allowed" errors into
// messages, and keeps strange errors out of the browser. Set verified: true for actions that send a request.
export async function withUser(
  options: { verified?: boolean },
  run: (context: UserContext) => Promise<UserActionResult>,
): Promise<UserActionResult> {
  try {
    const context = await (options.verified ? requireVerifiedUser() : requireUser());
    const ipHash = hashIp(readClientIp(await headers()));
    return await run({ ...context, ipHash });
  } catch (error) {
    if (error instanceof UserAuthError)
      return { ok: false, code: error.code, message: MESSAGES[error.code] };
    const known = error as { code?: string; message?: string; name?: string };
    if (known?.name === "ZodError")
      return {
        ok: false,
        code: "invalid",
        message: "Please check the values. One of them is not allowed.",
      };
    if (known && typeof known.code === "string" && known.code === "invalid")
      return { ok: false, code: "invalid", message: known.message ?? "That could not be done." };
    console.error("User action failed:", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
