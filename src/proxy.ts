import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 name for "middleware". It ONLY does two small things for /admin:
//   1. refreshes the Supabase login cookie
//   2. sends people who are not logged in to the login page
// It is NOT the real security check. Every page, route and Server Action calls requireAdmin() again
// (docs/ARCHITECTURE.md section 5).
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;
  const isPublicAdminPage = path === "/admin/login";

  // No Supabase set up (local development): let the pages decide.
  if (!url || !key) return NextResponse.next();

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

  const { data } = await supabase.auth.getUser();
  if (!data.user && !isPublicAdminPage) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return response;
}

export const config = { matcher: ["/admin/:path*"] };
