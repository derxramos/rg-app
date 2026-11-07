import "server-only";

// The core of requireRequestAccess. It has no cookie or Next.js code, so it is easy to test.
// A person reaches ONE request in three ways (docs/ARCHITECTURE.md section 5):
//   0. owner: they are signed in and requests.user_id is their id (all new requests)
//   1. the draft cookie (7 days): only for old guest requests made before accounts existed
//   2. the tracking session (1 hour): code + last 4 digits, for people who only have the code

import { eq } from "drizzle-orm";

import type { RequestStatus } from "@/lib/status";
import { requests } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { hmacHex, safeEqual, verifySigned } from "@/server/security/tokens";

export type RequestAction = "view" | "upload" | "removeFile" | "pay" | "submit";

export type AccessErrorCode = "no-cookie" | "invalid" | "expired" | "wrong-status" | "not-found";

export class AccessError extends Error {
  constructor(
    public code: AccessErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

// Which statuses allow which action, for each way of getting in.
const RULES: Record<
  RequestAction,
  { draft: readonly RequestStatus[]; tracking: readonly RequestStatus[] }
> = {
  view: { draft: ["draft"], tracking: [] }, // tracking: any status (checked below)
  upload: { draft: ["draft"], tracking: ["waiting_for_client"] },
  removeFile: { draft: ["draft"], tracking: [] },
  pay: { draft: ["draft"], tracking: ["submitted", "under_review", "waiting_for_client"] },
  submit: { draft: ["draft"], tracking: [] },
};

// For the signed-in owner. Same actions as the draft way, plus more after the request was sent:
// they can look at it at any time, pay while it is open, and add files when we ask for them.
const OWNER_RULES: Record<RequestAction, readonly RequestStatus[]> = {
  view: [], // any status (checked below)
  upload: ["draft", "waiting_for_client"],
  removeFile: ["draft"],
  pay: ["draft", "submitted", "under_review", "waiting_for_client"],
  submit: ["draft"],
};

export type AccessInput = {
  requestId: string;
  action: RequestAction;
  // The signed-in user (from the server session), or null/undefined for a visitor.
  userId?: string | null;
  // Cookie values, as read from the request.
  draftCookie?: string | null;
  trackingCookie?: string | null;
  secret: string;
  now?: Date;
};

// Draft cookie value: "<requestId>:<token>"
export function makeDraftCookieValue(requestId: string, token: string) {
  return `${requestId}:${token}`;
}

// Tracking session cookie value (signed): "<requestId>.<expiresAtMs>.<signature>"
export function makeTrackingSession(secret: string, requestId: string, expiresAtMs: number) {
  const payload = `${requestId}.${expiresAtMs}`;
  return `${payload}.${hmacHex(secret, payload)}`;
}

export function readTrackingSession(
  secret: string,
  value: string,
): { requestId: string; expiresAtMs: number } | null {
  const payload = verifySigned(secret, value);
  if (!payload) return null;
  const [requestId, expires] = payload.split(".");
  const expiresAtMs = Number(expires);
  return requestId && Number.isFinite(expiresAtMs) ? { requestId, expiresAtMs } : null;
}

export async function checkRequestAccess(db: AppDb, input: AccessInput) {
  const now = input.now ?? new Date();

  const [request] = await db
    .select()
    .from(requests)
    .where(eq(requests.id, input.requestId))
    .limit(1);
  // Same answer for "does not exist" and "not yours", so nothing is learned by guessing ids.
  if (!request) throw new AccessError("not-found");

  const rule = RULES[input.action];

  // 0. The owner. Another signed-in user gets nothing here and falls through to the cookies, which they
  // do not have. The answer is then the same as for a visitor.
  if (input.userId && request.userId === input.userId) {
    if (request.status === "draft") {
      if (!request.draftExpiresAt || request.draftExpiresAt.getTime() <= now.getTime()) {
        throw new AccessError("expired");
      }
    }
    const allowed =
      input.action === "view" ? true : OWNER_RULES[input.action].includes(request.status);
    if (!allowed) throw new AccessError("wrong-status");
    return { request, via: "owner" as const };
  }

  // 1. The draft cookie.
  if (input.draftCookie) {
    const separator = input.draftCookie.indexOf(":");
    const cookieRequestId = input.draftCookie.slice(0, separator);
    const token = input.draftCookie.slice(separator + 1);
    if (separator > 0 && cookieRequestId === input.requestId && request.draftTokenHash) {
      if (!safeEqual(hmacHex(input.secret, token), request.draftTokenHash)) {
        throw new AccessError("invalid");
      }
      if (!request.draftExpiresAt || request.draftExpiresAt.getTime() <= now.getTime()) {
        throw new AccessError("expired");
      }
      if (!rule.draft.includes(request.status)) throw new AccessError("wrong-status");
      return { request, via: "draft" as const };
    }
  }

  // 2. The tracking session.
  if (input.trackingCookie) {
    const session = readTrackingSession(input.secret, input.trackingCookie);
    if (!session || session.requestId !== input.requestId) throw new AccessError("invalid");
    if (session.expiresAtMs <= now.getTime()) throw new AccessError("expired");
    const allowed = input.action === "view" ? true : rule.tracking.includes(request.status);
    if (!allowed) throw new AccessError("wrong-status");
    return { request, via: "tracking" as const };
  }

  throw new AccessError("no-cookie");
}

// How the request pages should behave. "After send" means the request was already sent, so there is no
// numbered stepper and the way back goes to the person's request page instead of the next step.
export function flowMode(access: {
  via: "owner" | "draft" | "tracking";
  request: { id: string; status: RequestStatus };
}) {
  const afterSend =
    access.via === "tracking" || (access.via === "owner" && access.request.status !== "draft");
  const backHref =
    access.via === "tracking" ? "/track/result" : `/account/requests/${access.request.id}`;
  return { afterSend, backHref, showEarlierFiles: access.via !== "tracking" };
}
