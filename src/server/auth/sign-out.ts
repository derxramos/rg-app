import "server-only";

import { cookies, headers } from "next/headers";

import { logAuthEvent } from "@/server/auth/auth-log";
import { getSession } from "@/server/auth/session";
import { DEV_SIGNED_OUT, DEV_USER_COOKIE, ensureProfile } from "@/server/auth/session-core";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";

// Ends the login on the SERVER: writes the log row, tells Supabase to end the session, and clears the
// cookies. Called by POST /auth/sign-out (a plain form post, never a link).
export async function performSignOut(): Promise<void> {
  const db = getDb();
  const ipHash = hashIp(readClientIp(await headers()));

  const session = await getSession();
  if (session) {
    const profile = await ensureProfile(db, session);
    await logAuthEvent(db, {
      action: "auth.logout",
      userId: profile.id,
      isAdmin: profile.role === "admin",
      ipHash,
    });
  }

  if (supabaseAuthConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
  }

  const jar = await cookies();
  // Development only: remember "signed out on purpose", so the dev admin bypass does not sign you in again.
  if (process.env.NODE_ENV === "development") {
    jar.set(DEV_USER_COOKIE, DEV_SIGNED_OUT, { httpOnly: true, sameSite: "lax", path: "/" });
  } else {
    jar.delete(DEV_USER_COOKIE);
  }
  jar.delete({ name: "rg_fresh2fa", path: "/admin" });
}
