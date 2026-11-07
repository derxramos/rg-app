import { NextResponse, type NextRequest } from "next/server";

import { classifyGoogleReturn, googleLanding, isGoogleSignInEnabled } from "@/lib/google-signin";
import { logAuthEvent } from "@/server/auth/auth-log";
import { ensureProfile } from "@/server/auth/session-core";
import { performSignOut } from "@/server/auth/sign-out";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";

// Step 2 of "Continue with Google": Google sends the person back here with a one-time code.
// exchangeCodeForSession checks the code (and the PKCE cookie) with Supabase and starts the login cookie.
// The role always comes from our profiles table, never from Google.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const back = (reason: string, detail?: string) =>
    NextResponse.redirect(
      new URL(
        `/login?reason=${reason}${detail ? `&detail=${encodeURIComponent(detail)}` : ""}`,
        request.url,
      ),
    );

  if (!isGoogleSignInEnabled(process.env.GOOGLE_SIGNIN_ENABLED) || !supabaseAuthConfigured())
    return back("google-off");
  const code = params.get("code");
  if (params.get("error") || !code) {
    // Only a "No" on the Google screen is "cancelled". Other errors are failures, and we keep the reason.
    const result = classifyGoogleReturn(params);
    console.error("Google sign in did not finish:", {
      error: params.get("error"),
      error_code: params.get("error_code"),
      error_description: params.get("error_description"),
    });
    return back(result.reason, result.detail);
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("Google sign in: code exchange failed:", error?.code, error?.message);
    return back("google-failed", error?.code ?? "exchange_failed");
  }

  const db = getDb();
  const ipHash = hashIp(readClientIp(request.headers));
  const profile = await ensureProfile(db, {
    userId: data.user.id,
    email: data.user.email ?? "",
    source: "supabase",
  });

  const landing = googleLanding(profile.role, params.get("next"));
  if (!landing.ok) {
    // Admins use the admin sign in (email, password and the 2-step code). End this login at once.
    await logAuthEvent(db, {
      action: "auth.login.failed",
      userId: profile.id,
      isAdmin: true,
      ipHash,
      details: { provider: "google", reason: "admin-must-use-password" },
    });
    await performSignOut();
    return back("google-admin");
  }

  await logAuthEvent(db, {
    action: "auth.login.success",
    userId: profile.id,
    ipHash,
    details: { provider: "google" },
  });
  const response = NextResponse.redirect(new URL(landing.path, request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
