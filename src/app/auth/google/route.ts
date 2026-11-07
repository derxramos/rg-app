import { NextResponse, type NextRequest } from "next/server";

import { googleCallbackUrl, isGoogleSignInEnabled } from "@/lib/google-signin";
import { getBaseUrl } from "@/lib/site-url";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";

// Step 1 of "Continue with Google": a plain link (GET) from the sign in and register pages.
// We ask Supabase for the Google address, then send the browser there. Supabase keeps a one-time
// secret (PKCE) in a cookie, so only THIS browser can finish the sign in at /auth/callback.
// Nothing is created yet: no account exists until Google says yes.
export async function GET(request: NextRequest) {
  const back = (reason: string) =>
    NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url));

  if (!isGoogleSignInEnabled(process.env.GOOGLE_SIGNIN_ENABLED) || !supabaseAuthConfigured())
    return back("google-off");

  const ipHash = hashIp(readClientIp(request.headers));
  const limit = await rateLimit(getDb(), {
    key: `google:ip:${ipHash}`,
    limit: 20,
    windowSeconds: 900,
  });
  if (!limit.allowed) return back("google-busy");

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: googleCallbackUrl(getBaseUrl(), request.nextUrl.searchParams.get("next")),
      // Always let the person choose which Google account to use.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return back("google-failed");

  const response = NextResponse.redirect(data.url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
