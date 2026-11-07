import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/safe-next";
import { logAuthEvent } from "@/server/auth/auth-log";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";

// The link in the verify-email and reset-password emails points here (see the Supabase email templates in
// docs/AUTH_AND_ROLES.md):  /auth/confirm?token_hash=...&type=email|recovery&next=/account
// verifyOtp checks the one-time token with Supabase and starts the login cookie. Then we send the person on.
const TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery", "invite", "magiclink"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const fail = () => NextResponse.redirect(new URL("/auth/error", request.url));

  if (!supabaseAuthConfigured() || !tokenHash || !type || !TYPES.includes(type)) return fail();

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail();

  if (data.user && type !== "recovery") {
    await logAuthEvent(getDb(), {
      action: "auth.email_verified",
      userId: data.user.id,
      ipHash: hashIp(readClientIp(request.headers)),
    });
  }

  // A reset link always goes to the "new password" page. Other links go to a safe path on this site.
  const destination =
    type === "recovery" ? "/reset-password" : safeNextPath(params.get("next"), "/account");
  return NextResponse.redirect(new URL(destination, request.url));
}
