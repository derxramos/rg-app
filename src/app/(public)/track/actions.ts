"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { setTrackingCookie } from "@/server/auth/request-access";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";
import { verifyTurnstile } from "@/server/security/turnstile";
import { TRACK_NOT_FOUND, attemptTracking } from "@/server/services/tracking";

export type TrackState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "locked"; message: string }
  | { status: "limited"; message: string };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// Tracking form (docs/FEATURES.md P12): IP limit (10 per 15 minutes), Turnstile, then the code and the last
// 4 digits with a lock after 5 wrong tries. On success a 1 hour session starts for this ONE request.
export async function trackAction(_previous: TrackState, formData: FormData): Promise<TrackState> {
  const db = getDb();
  const ip = readClientIp(await headers());

  const limit = await rateLimit(db, { key: `track:ip:${hashIp(ip)}`, limit: 10, windowSeconds: 900 });
  if (!limit.allowed) {
    return { status: "limited", message: `Too many tries from this device. Please wait about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` };
  }
  if (!(await verifyTurnstile({ token: text(formData, "cf-turnstile-response"), ip }))) {
    return { status: "error", message: "The spam check did not pass. Please try again." };
  }

  const attempt = await attemptTracking(db, { code: text(formData, "code"), last4: text(formData, "last4").trim() });
  if (attempt.kind === "locked") {
    return { status: "locked", message: `Too many tries. Please wait ${Math.ceil(attempt.retryAfterSeconds / 60)} minutes and try again.` };
  }
  if (attempt.kind === "not-found") return { status: "error", message: TRACK_NOT_FOUND };

  await setTrackingCookie(attempt.requestId);
  redirect("/track/result");
}
