import "server-only";

import { and, eq } from "drizzle-orm";

import { phoneLast4 } from "@/lib/phone";
import { canChangeStatus, type RequestStatus, type StatusActor } from "@/lib/status";
import { generateTrackingCode } from "@/lib/tracking-code";
import type { RequestDetails } from "@/lib/validation/request";
import { activityLog, requestStatusEvents, requests, services } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { hmacHex, newToken } from "@/server/security/tokens";

export const DRAFT_LIFETIME_DAYS = 7;

export class RequestError extends Error {
  constructor(
    public code: "service-not-found" | "not-found" | "status-not-allowed" | "code-collision",
    message: string,
  ) {
    super(message);
  }
}

// Postgres error code 23505 is "unique violation". Drizzle may wrap the original error.
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

type CreateDraftOptions = {
  // The signed-in owner of the request.
  userId?: string | null;
  consentVersion: string;
  secret: string;
  now?: Date;
  // Replaceable in tests, to force a tracking code clash.
  makeCode?: () => string;
};

// Step 1: saves the request as a Draft and makes the tracking code and the draft token.
// The token goes into the client's cookie. The database keeps only its hash.
export async function createDraft(db: AppDb, details: RequestDetails, options: CreateDraftOptions) {
  const now = options.now ?? new Date();

  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.slug, details.serviceSlug), eq(services.isActive, true)))
    .limit(1);
  if (!service) throw new RequestError("service-not-found", "That service is not available.");

  const token = newToken();
  const draftExpiresAt = new Date(now.getTime() + DRAFT_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const makeCode = options.makeCode ?? generateTrackingCode;

  // A clash of two random codes is very unlikely, but possible. Try again a few times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const trackingCode = makeCode();
    try {
      const requestId = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(requests)
          .values({
            trackingCode,
            serviceId: service.id,
            status: "draft",
            userId: options.userId ?? null,
            clientFullName: details.fullName,
            clientEmail: details.email,
            clientPhone: details.phone,
            clientPhoneLast4: phoneLast4(details.phone),
            businessName: details.businessName || null,
            clientMessage: details.message || null,
            consentVersion: options.consentVersion,
            consentAt: now,
            draftTokenHash: hmacHex(options.secret, token),
            draftExpiresAt,
          })
          .returning({ id: requests.id });
        await tx.insert(requestStatusEvents).values({
          requestId: row.id,
          fromStatus: null,
          toStatus: "draft",
        });
        return row.id;
      });
      return { requestId, trackingCode, token, draftExpiresAt };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new RequestError("code-collision", "Could not make a tracking code. Please try again.");
}

type ChangeStatusOptions = {
  requestId: string;
  to: RequestStatus;
  actor: StatusActor;
  adminId?: string | null;
  ipHash?: string | null;
  now?: Date;
};

// Changes the status if the rules allow it (src/lib/status.ts), writes the timeline row, and (for an
// admin) the activity log. Every status change in the app goes through this one function.
export async function changeStatus(db: AppDb, options: ChangeStatusOptions) {
  const now = options.now ?? new Date();

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: requests.id, status: requests.status })
      .from(requests)
      .where(eq(requests.id, options.requestId))
      .for("update")
      .limit(1);
    if (!current) throw new RequestError("not-found", "Request not found.");

    if (!canChangeStatus(options.actor, current.status, options.to)) {
      throw new RequestError(
        "status-not-allowed",
        `A ${options.actor} cannot change a request from ${current.status} to ${options.to}.`,
      );
    }

    const changes: Partial<typeof requests.$inferInsert> = { status: options.to };
    if (options.to === "submitted" || options.to === "payment_submitted") {
      // Set on the first submit only.
      if (current.status === "draft") changes.submittedAt = now;
    }
    if (current.status === "draft") {
      // The draft cookie stops working once the request is sent.
      changes.draftTokenHash = null;
      changes.draftExpiresAt = null;
    }
    if (options.to === "completed") changes.completedAt = now;
    if (options.to === "cancelled") changes.cancelledAt = now;
    if (current.status === "completed" && options.to === "in_progress") changes.completedAt = null;

    await tx.update(requests).set(changes).where(eq(requests.id, options.requestId));
    await tx.insert(requestStatusEvents).values({
      requestId: options.requestId,
      fromStatus: current.status,
      toStatus: options.to,
      changedBy: options.actor === "admin" ? (options.adminId ?? null) : null,
    });

    if (options.actor === "admin") {
      await tx.insert(activityLog).values({
        actorType: "admin",
        actorId: options.adminId ?? null,
        action: "request.status_changed",
        entityType: "request",
        entityId: options.requestId,
        details: { from: current.status, to: options.to },
        ipHash: options.ipHash ?? null,
      });
    }
    return { from: current.status, to: options.to };
  });
}

// What the review page shows: the request with its service name.
export async function getRequestWithService(db: AppDb, requestId: string) {
  const [row] = await db
    .select({
      id: requests.id,
      trackingCode: requests.trackingCode,
      status: requests.status,
      serviceId: requests.serviceId,
      serviceName: services.name,
      clientFullName: requests.clientFullName,
      clientEmail: requests.clientEmail,
      clientPhone: requests.clientPhone,
      businessName: requests.businessName,
      clientMessage: requests.clientMessage,
    })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(eq(requests.id, requestId))
    .limit(1);
  return row ?? null;
}
