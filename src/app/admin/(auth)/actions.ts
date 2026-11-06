"use server";

// Login, 2FA and logout. These run BEFORE a person is an admin, so they do not use requireAdmin.
// Everything else in the admin area does (see tests/unit/admin-actions-guard.test.ts).

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/server/auth/admin";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { activityLog, adminProfiles } from "@/server/db/schema";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";

const GENERIC_LOGIN_ERROR = "The email or password is not right.";

async function logLogin(
  action: "login.success" | "login.failed",
  ipHash: string,
  adminId: string | null,
) {
  await getDb()
    .insert(activityLog)
    .values({
      actorType: adminId ? "admin" : "system",
      actorId: adminId,
      action,
      entityType: "login",
      details: {},
      ipHash,
    });
}

export async function loginAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!supabaseAuthConfigured()) {
    return {
      ok: false,
      message: "Login is not set up yet. The Supabase keys are missing in the settings.",
    };
  }
  const db = getDb();
  const ipHash = hashIp(readClientIp(await headers()));

  // 5 tries from one place in 15 minutes (docs/FEATURES.md A1).
  const limit = await rateLimit(db, { key: `login:ip:${ipHash}`, limit: 5, windowSeconds: 900 });
  if (!limit.allowed)
    return { ok: false, message: "Too many tries. Please wait 15 minutes and try again." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await logLogin("login.failed", ipHash, null);
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  // A login that is not an active admin gets the SAME message, so nothing is learned about who is an admin.
  const [profile] = await db
    .select()
    .from(adminProfiles)
    .where(eq(adminProfiles.id, data.user.id))
    .limit(1);
  if (!profile || !profile.isActive) {
    await supabase.auth.signOut();
    await logLogin("login.failed", ipHash, null);
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  await db
    .update(adminProfiles)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminProfiles.id, profile.id));
  await logLogin("login.success", ipHash, profile.id);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  redirect(factors?.totp.some((f) => f.status === "verified") ? "/admin/mfa" : "/admin/mfa/setup");
}

// Step 2: the 6-digit code from the authenticator app. A good code lifts the session to AAL2.
export async function verifyMfaAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!supabaseAuthConfigured()) return { ok: false, message: "Login is not set up yet." };
  const db = getDb();
  const ipHash = hashIp(readClientIp(await headers()));
  const limit = await rateLimit(db, { key: `mfa:ip:${ipHash}`, limit: 10, windowSeconds: 900 });
  if (!limit.allowed) return { ok: false, message: "Too many tries. Please wait 15 minutes." };

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const supabase = await createSupabaseServer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/admin/login");

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
  const supabase = await createSupabaseServer();
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, message: "That code is not right. Please try the newest code." };
  return { ok: true, message: "Done. Your authenticator app is set up." };
}

export async function logoutAction(): Promise<void> {
  if (supabaseAuthConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}
