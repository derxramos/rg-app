"use server";

// The 2FA code steps. Sign in and sign out are in src/app/auth/actions.ts (one login for everyone).
// These run BEFORE a person is fully an admin, so they do not use requirePanel.
// Everything else in the admin area does (see tests/unit/admin-actions-guard.test.ts).

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PanelAuthError, markMfaSetupDone } from "@/server/auth/panel-core";
import { createMfaApi } from "@/server/auth/mfa-api";
import {
  DEVICES_NEEDED,
  DeviceError,
  cleanDeviceName,
  finishEnrollment,
  startEnrollment,
  verifiedOf,
} from "@/server/auth/mfa-devices";
import { recordDeviceEvent } from "@/server/auth/device-log";
import { requirePanelPendingMfa, type ActionResult } from "@/server/auth/panel";
import { createSupabaseServer, supabaseAuthConfigured } from "@/server/auth/supabase-server";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";

const NOT_ALLOWED = "This account is not allowed here.";

// These steps are for staff, admin and owner accounts only (the password step is done, the 2FA step may not be).
// A normal client cannot enroll an authenticator or try codes here. Returns the session, or null.
async function adminPending() {
  try {
    return await requirePanelPendingMfa();
  } catch (error) {
    if (error instanceof PanelAuthError) return null;
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
  const devices = factors?.totp.filter((f) => f.status === "verified") ?? [];
  if (devices.length === 0) redirect("/admin/mfa/setup");

  // A code from ANY of the person's devices is accepted, so the backup phone works too.
  let accepted = false;
  for (const device of devices) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: device.id, code });
    if (!error) {
      accepted = true;
      break;
    }
  }
  if (!accepted)
    return { ok: false, message: "That code is not right. Please try the newest code." };
  redirect("/admin");
}

// Setup, part 1: makes a new authenticator entry and returns the QR picture and the secret text.
// A person who already has a device must have passed the code step first (the higher level). Otherwise
// someone who only knows the password could add their own device.
export async function startEnrollAction(
  name: string,
): Promise<
  { ok: true; factorId: string; qr: string; secret: string } | { ok: false; message: string }
> {
  if (!supabaseAuthConfigured()) return { ok: false, message: "Login is not set up yet." };
  const session = await adminPending();
  if (!session) return { ok: false, message: NOT_ALLOWED };
  const api = await createMfaApi();
  const hasDevice = verifiedOf(await api.list()).length > 0;
  if (hasDevice && session.aal !== "aal2")
    return { ok: false, message: "Please enter a code from your authenticator app first." };
  try {
    const started = await startEnrollment(api, cleanDeviceName(name, "My phone"));
    return { ok: true, factorId: started.id, qr: started.qr, secret: started.secret };
  } catch {
    return { ok: false, message: "We could not start the setup. Please try again." };
  }
}

// Setup, part 2: the first code proves the app was set up right. When there are two devices, the panel opens.
export async function verifyEnrollAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { verifiedCount?: number }> {
  if (!supabaseAuthConfigured()) return { ok: false, message: "Login is not set up yet." };
  const session = await adminPending();
  if (!session) return { ok: false, message: NOT_ALLOWED };
  try {
    const count = await finishEnrollment(await createMfaApi(), {
      factorId: String(formData.get("factorId") ?? ""),
      code: String(formData.get("code") ?? ""),
    });
    if (count >= DEVICES_NEEDED) await markMfaSetupDone(getDb(), session.userId);
    await recordDeviceEvent(session.userId, "mfa.device_added", { devices: count });
    return { ok: true, message: "Done. Your authenticator app is set up.", verifiedCount: count };
  } catch (error) {
    if (error instanceof DeviceError) return { ok: false, message: error.message };
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
