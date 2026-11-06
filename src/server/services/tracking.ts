import "server-only";

// The tracking page logic (docs/FEATURES.md P12, docs/SECURITY_AND_PRIVACY.md T3).
import { and, asc, count, eq, gt, ne } from "drizzle-orm";

import { STATUS_LABELS, type RequestStatus } from "@/lib/status";
import { TRACKING_CODE_PATTERN, normalizeTrackingCode } from "@/lib/tracking-code";
import { payments, rateLimits, requestStatusEvents, requests, services } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { safeEqual } from "@/server/security/tokens";

// Same value as ERASED_NAME in admin-requests.ts. A request whose data was deleted cannot be tracked any more.
const ERASED_NAME = "Deleted client";

// The SAME message for a wrong code and wrong digits, so an attacker learns nothing.
export const TRACK_NOT_FOUND = "We could not find a request with those details. Please check the code and the 4 digits.";

export const MAX_WRONG_TRIES = 5;
export const LOCK_MINUTES = 15;
const WINDOW_MS = LOCK_MINUTES * 60 * 1000;

export type TrackAttempt =
  | { kind: "ok"; requestId: string }
  | { kind: "not-found" }
  | { kind: "locked"; retryAfterSeconds: number };

const failKey = (code: string) => `track:fail:${code}`;
const lockKey = (code: string) => `track:lock:${code}`;

// Wrong tries are counted per CODE, also for codes that do not exist. So a code that exists and one that
// does not behave in exactly the same way. Each wrong try is one row, so the 15 minutes slide exactly.
export async function attemptTracking(
  db: AppDb,
  input: { code: string; last4: string; now?: Date },
): Promise<TrackAttempt> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - WINDOW_MS);
  const code = normalizeTrackingCode(input.code);

  // 1. Is the code locked? Then even the RIGHT digits are refused (the 6th try).
  const [lock] = await db
    .select({ at: rateLimits.windowStart })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, lockKey(code)), gt(rateLimits.windowStart, since)))
    .orderBy(asc(rateLimits.windowStart))
    .limit(1);
  if (lock) {
    return { kind: "locked", retryAfterSeconds: Math.max(1, Math.ceil((lock.at.getTime() + WINDOW_MS - now.getTime()) / 1000)) };
  }

  // 2. Check the request. A draft is not a sent request, so it cannot be tracked.
  let requestId: string | null = null;
  if (TRACKING_CODE_PATTERN.test(code) && /^\d{4}$/.test(input.last4)) {
    const [row] = await db
      .select({ id: requests.id, last4: requests.clientPhoneLast4 })
      .from(requests)
      .where(and(eq(requests.trackingCode, code), ne(requests.status, "draft"), ne(requests.clientFullName, ERASED_NAME)))
      .limit(1);
    if (row && safeEqual(row.last4, input.last4)) requestId = row.id;
  }
  if (requestId) {
    // A right answer clears the wrong tries for this code.
    await db.delete(rateLimits).where(eq(rateLimits.key, failKey(code)));
    return { kind: "ok", requestId };
  }

  // 3. A wrong try. At 5 wrong tries in 15 minutes the code is locked for 15 minutes.
  await db.insert(rateLimits).values({ key: failKey(code), windowStart: now, count: 1 }).onConflictDoNothing();
  const [{ n }] = await db
    .select({ n: count() })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, failKey(code)), gt(rateLimits.windowStart, since)));
  if (n >= MAX_WRONG_TRIES) {
    await db.insert(rateLimits).values({ key: lockKey(code), windowStart: now, count: 1 }).onConflictDoNothing();
  }
  return { kind: "not-found" };
}

export type TrackingView = {
  serviceName: string;
  status: RequestStatus;
  statusLabel: string;
  timeline: { status: RequestStatus; at: Date }[];
  // The latest message from the admin (visibility "client"). Nothing else the client wrote or sent.
  message: string | null;
  payment: "none" | "pending" | "verified" | "rejected";
  canPay: boolean;
  canUploadMore: boolean;
};

const PAY_STATUSES: readonly RequestStatus[] = ["submitted", "under_review", "waiting_for_client"];

// The ONLY data the tracking page may show: service name, status, timeline, the admin's message, and a payment
// summary. Never files, file names, email, phone, or payment details (CLAUDE.md rule 9).
export async function getTrackingView(db: AppDb, requestId: string): Promise<TrackingView | null> {
  const [request] = await db
    .select({ status: requests.status, message: requests.publicMessage, serviceName: services.name })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!request) return null;

  const events = await db
    .select({ status: requestStatusEvents.toStatus, at: requestStatusEvents.createdAt })
    .from(requestStatusEvents)
    .where(and(eq(requestStatusEvents.requestId, requestId), ne(requestStatusEvents.toStatus, "draft")))
    .orderBy(asc(requestStatusEvents.createdAt));

  const paid = await db.select({ status: payments.status }).from(payments).where(eq(payments.requestId, requestId));
  const payment = paid.some((p) => p.status === "verified") ? "verified" : paid.some((p) => p.status === "pending") ? "pending" : paid.some((p) => p.status === "rejected") ? "rejected" : "none";

  return {
    serviceName: request.serviceName,
    status: request.status,
    statusLabel: STATUS_LABELS[request.status],
    timeline: events,
    message: request.message,
    payment,
    canPay: PAY_STATUSES.includes(request.status),
    canUploadMore: request.status === "waiting_for_client",
  };
}
