import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { passwordIsRight } from "@/server/auth/reauth";
import { requireUser } from "@/server/auth/session";
import { DEV_SIGNED_OUT, DEV_USER_COOKIE, UserAuthError } from "@/server/auth/session-core";
import { createAuthDeleteApi } from "@/server/auth/supabase-admin";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";
import { AccountError, deleteMyAccount } from "@/server/services/account";
import { CLIENT_FILES_BUCKET, getStorage } from "@/server/storage/storage";

// POST /api/account/delete  ("Delete my account", Data Privacy Act).
// A route handler and not a Server Action on purpose: a Server Action that changes cookies makes Next.js
// draw the current page again, and by then the person is signed out. The form calls this with fetch and
// then loads the home page in full.
// Needs: a login, the word DELETE, and the password again. Refused for admins and while a request is open.
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let account;
  try {
    account = await requireUser();
  } catch (error) {
    if (error instanceof UserAuthError)
      return json({ ok: false, message: "Please sign in again." }, 401);
    throw error;
  }
  const { session, profile } = account;

  const db = getDb();
  const ipHash = hashIp(readClientIp(request.headers));

  // 5 tries in 15 minutes, because the password is asked again.
  const limit = await rateLimit(db, {
    key: `delete-account:${profile.id}`,
    limit: 5,
    windowSeconds: 900,
  });
  if (!limit.allowed)
    return json({ ok: false, message: "Too many tries. Please wait a while." }, 429);

  const form = await request.formData();
  if (String(form.get("confirm") ?? "").trim() !== "DELETE")
    return json({
      ok: false,
      message: "Please check the form.",
      errors: { confirm: "Type the word DELETE in capital letters." },
    });

  // The password is asked again, so a stolen open browser cannot delete the account.
  if (!(await passwordIsRight(session, String(form.get("password") ?? ""))))
    return json({
      ok: false,
      message: "Please check the form.",
      errors: { password: "That password is not right." },
    });

  try {
    await deleteMyAccount(db, getStorage(), createAuthDeleteApi(), {
      userId: profile.id,
      bucket: CLIENT_FILES_BUCKET(),
      ipHash,
    });
  } catch (error) {
    if (error instanceof AccountError) return json({ ok: false, message: error.message });
    console.error("Account delete failed:", error);
    return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
  }

  // The login is gone. Clear this browser's session and leave a note for the home page.
  if (supabaseAuthConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut().catch(() => {});
  }
  const jar = await cookies();
  if (process.env.NODE_ENV === "development") {
    jar.set(DEV_USER_COOKIE, DEV_SIGNED_OUT, { httpOnly: true, sameSite: "lax", path: "/" });
  } else {
    jar.delete(DEV_USER_COOKIE);
  }
  jar.set("rg_flash", "account_deleted", {
    maxAge: 30,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return json({ ok: true, message: "Your account was deleted." });
}
