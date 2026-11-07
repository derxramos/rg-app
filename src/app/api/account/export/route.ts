import { NextResponse } from "next/server";

import { requireUser } from "@/server/auth/session";
import { UserAuthError } from "@/server/auth/session-core";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";
import { exportMyData } from "@/server/services/account";

// POST /api/account/export  ("Download my data", Data Privacy Act).
// POST only, from a button, so a link on another website cannot start it. Returns the person's own data
// as a JSON file. The user id comes from the server session, never from the browser.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let userId: string;
  try {
    userId = (await requireUser()).profile.id;
  } catch (error) {
    if (error instanceof UserAuthError)
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    throw error;
  }

  const db = getDb();
  const ipHash = hashIp(readClientIp(request.headers));
  const limit = await rateLimit(db, { key: `export:${userId}`, limit: 5, windowSeconds: 3600 });
  if (!limit.allowed)
    return NextResponse.json(
      { ok: false, error: "Too many downloads. Please wait." },
      { status: 429 },
    );

  const data = await exportMyData(db, userId, ipHash);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="my-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
