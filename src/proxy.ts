import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { loginUrlFor } from "@/lib/safe-next";

// Next.js 16 name for "middleware". It does three small things for the private areas (/account, /admin):
//   1. refreshes the Supabase login cookie
//   2. sends people who are not logged in to the login page, with a way back
//   3. tells the browser not to keep private pages (Cache-Control: no-store), so the Back button
//      after sign out cannot show them again
// It is NOT the real security check. Every page, route and Server Action checks access again
// (requireUser / requireAdmin / requireRequestAccess), because a Server Action can be called directly.

// /admin/login only redirects to /login, so it must stay open.
const PUBLIC_ADMIN_PAGES = new Set(["/admin/login"]);

// True when the browser sent a Supabase login cookie (sb-...-auth-token). If it did but the session is
// no longer valid, the login page says "Your session ended".
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => /^sb-.*-auth-token/.test(cookie.name));
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;
  const isPublicPage = PUBLIC_ADMIN_PAGES.has(path);

  // No Supabase set up (local development): let the pages decide.
  if (!url || !key) return withNoStore(NextResponse.next());

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Development only: a test login (see /api/dev-login) has no Supabase session. Let the pages decide.
  if (process.env.NODE_ENV === "development" && request.cookies.has("rg_dev_user")) {
    return withNoStore(response);
  }

  // getClaims checks the token signature and refreshes it when needed. getSession() is never used here.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && !isPublicPage) {
    const destination = new URL(
      loginUrlFor(path + request.nextUrl.search, { expired: hasAuthCookie(request) }),
      request.url,
    );
    return withNoStore(NextResponse.redirect(destination));
  }
  return withNoStore(response);
}

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: ["/account/:path*", "/admin/:path*"] };
