import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/safe-next";
import { DEV_USER_COOKIE, devUserSession } from "@/server/auth/session-core";

// DEVELOPMENT ONLY. Picks a test user without Supabase, for trying pages and for the Playwright tests.
//   /api/dev-login?email=zolb-test+a@example.com&next=/account     sign in as that test user
//   /api/dev-login?logout=1                                         sign out
// Outside development this route answers 404, so it cannot be used on a real site. The email must be in
// DEV_USER_BYPASS_EMAILS and must look like zolb-test+...@example.com.
export function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });

  const params = request.nextUrl.searchParams;
  const destination = new URL(safeNextPath(params.get("next"), "/"), request.url);
  const response = NextResponse.redirect(destination);

  if (params.get("logout")) {
    response.cookies.delete(DEV_USER_COOKIE);
    return response;
  }

  const email = params.get("email") ?? "";
  const session = devUserSession({
    nodeEnv: process.env.NODE_ENV,
    allowList: process.env.DEV_USER_BYPASS_EMAILS,
    cookie: email,
  });
  if (!session) {
    return new NextResponse("That email is not allowed. Check DEV_USER_BYPASS_EMAILS.", {
      status: 400,
    });
  }
  response.cookies.set(DEV_USER_COOKIE, session.email, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
  return response;
}
