"use server";

// The 2FA code steps. Sign in and sign out are in src/app/auth/actions.ts (one login for everyone).
// These run BEFORE a person is fully an admin, so they do not use requireAdmin.
// Everything else in the admin area does (see tests/unit/admin-actions-guard.test.ts).

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminAuthError } from "@/server/auth/admin-core";
import { requireAdminPendingMfa, type ActionResult } from "@/server/auth/admin";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";

const NOT_ALLOWED = "This account is not allowed here.";

// These steps are for admins only (the password step is done, the 2FA step may not be). A normal user
// cannot enroll an authenticator or try codes here.
async function adminPending(): Promise<boolean> {
  try {
    await requireAdminPendingMfa();
    return true;
  } catch (error) {
    if (error instanceof AdminAuthError) return false;
    throw error;
  }
}

// Step 2: the 6-digit code from the authenticator app. A good code lifts the session to AAL2.
export async function verifyMfaAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!supabaseAuthConfigured()) return { ok: false, message: "Login is not set up yet." };
  if (!(await adminPending())) return { ok: false, message: NOT_ALLOWED };
  const db = getDb();
  const ipHash = hashIp(readClientIp(await headers()));
  const limit = await rateLimit(db, { key: `mfa:ip:${ipHash}`, limit: 10, windowSeconds: 900 });
  if (!limit.allowed) return { ok: false, message: "Too many tries. Please wait 15 minutes." };

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const supabase = await createSupabaseServer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/login?next=%2Fadmin");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/admin/mfa/setup");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { ok: false, message: "That code is not right. Please try the newest code." };
  redirect("/admin");
}

// Setup, part 1: makes a new authenticator entry and returns the QR picture and the secret text.
export async function startEnrollAction(): Promise<
  { ok: true; factorId: string; qr: string; secret: string } | { ok: false; message: string }
> {
  if (!supabaseAuthConfigured()) return { ok: false, message: "Login is not set up yet." };
  if (!(await adminPending())) return { ok: false, message: NOT_ALLOWED };
  const supabase = await createSupabaseServer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, message: "Please log in again." };
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `RG device ${new Date().toISOString().slice(0, 16)}`,
  });
  if (error || !data)
    return { ok: false, message: "We could not start the setup. Please try again." };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

// Setup, part 2: the first code proves the app was set up right.
export async function verifyEnrollAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!supabaseAuthConfigured()) return { ok: false, message: "Login is not set up yet." };
  if (!(await adminPending())) return { ok: false, message: NOT_ALLOWED };
  const supabase = await createSupabaseServer();
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, message: "That code is not right. Please try the newest code." };
  return { ok: true, message: "Done. Your authenticator app is set up." };
}
