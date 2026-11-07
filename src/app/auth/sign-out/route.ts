import { NextResponse, type NextRequest } from "next/server";

import { performSignOut } from "@/server/auth/sign-out";

// Sign out. POST only, from a plain <form method="post"> (a link or a GET does nothing), so another
// website cannot sign someone out by loading a picture or a link. The cookie is SameSite=Lax, which
// also keeps it off cross-site POSTs. We check the Origin header as well.
//
// It answers with a FULL page redirect (303), not a soft in-page navigation. A soft navigation would let
// the browser Back button show the private page again from the in-memory cache of the Next.js router.
// A 30 second "flash" cookie tells the home page to show "You have been signed out." once.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await performSignOut();
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/", "Cache-Control": "no-store" },
  });
  // Not httpOnly on purpose: the page script reads it once and deletes it. It holds no private data.
  response.cookies.set("rg_flash", "signed_out", {
    maxAge: 30,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
