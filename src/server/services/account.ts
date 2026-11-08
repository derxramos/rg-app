import "server-only";

// What a signed-in user can see and do with their own data: My requests, one request, their profile,
// "Download my data" and "Delete my account" (Data Privacy Act, docs/SECURITY_AND_PRIVACY.md section 2).
//
// Every function takes the user id and filters by it, AND the pages run the reads through
// withUserRls (database Row Level Security). Two separate locks: a bug in one does not leak data.
// Reads that run as the "authenticated" role must use explicit column lists (private columns are hidden).

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { isPanelRole } from "@/lib/permissions";
import { STATUS_LABELS, type RequestStatus } from "@/lib/status";
import { logAuthEvent } from "@/server/auth/auth-log";
import {
  activityLog,
  payments,
  profiles,
  requestFiles,
  requestNotes,
  requestStatusEvents,
  requests,
  services,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { eraseRequestData } from "@/server/services/admin-requests";
import type { StorageDriver } from "@/server/storage/types";

// ---------- My requests ----------

export type MyRequestRow = {
  id: string;
  trackingCode: string;
  serviceName: string;
  status: RequestStatus;
  createdAt: Date;
  submittedAt: Date | null;
};

export async function listMyRequests(db: AppDb, userId: string): Promise<MyRequestRow[]> {
  return db
    .select({
      id: requests.id,
      trackingCode: requests.trackingCode,
      serviceName: services.name,
      status: requests.status,
      createdAt: requests.createdAt,
      submittedAt: requests.submittedAt,
    })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(eq(requests.userId, userId))
    .orderBy(desc(requests.createdAt));
}

// A request counts as "open" until it is finished. A draft is not open: it can be removed with the account.
export const OPEN_STATUSES: readonly RequestStatus[] = [
  "submitted",
  "under_review",
  "waiting_for_client",
  "payment_submitted",
  "payment_verified",
  "in_progress",
];

const PAY_STATUSES: readonly RequestStatus[] = ["submitted", "under_review", "waiting_for_client"];

export type MyRequestDetail = {
  id: string;
  trackingCode: string;
  serviceName: string;
  status: RequestStatus;
  statusLabel: string;
  createdAt: Date;
  // The latest message from us (visibility "client").
  message: string | null;
  messages: { body: string; at: Date }[];
  timeline: { status: RequestStatus; at: Date }[];
  // Names and dates only. No link to open a file, and the storage path is never read.
  files: { id: string; name: string; uploadedAt: Date; sizeBytes: number }[];
  payments: {
    id: string;
    status: "pending" | "verified" | "rejected";
    amountCentavos: number;
    paidOn: string;
    rejectionReason: string | null;
  }[];
  canPay: boolean;
  canUploadMore: boolean;
};

// Returns null when the request does not exist OR belongs to someone else (the same answer for both).
export async function getMyRequest(
  db: AppDb,
  userId: string,
  requestId: string,
): Promise<MyRequestDetail | null> {
  const [request] = await db
    .select({
      id: requests.id,
      trackingCode: requests.trackingCode,
      status: requests.status,
      message: requests.publicMessage,
      createdAt: requests.createdAt,
      serviceName: services.name,
    })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(and(eq(requests.id, requestId), eq(requests.userId, userId)))
    .limit(1);
  if (!request) return null;

  const timeline = await db
    .select({ status: requestStatusEvents.toStatus, at: requestStatusEvents.createdAt })
    .from(requestStatusEvents)
    .where(
      and(eq(requestStatusEvents.requestId, requestId), ne(requestStatusEvents.toStatus, "draft")),
    )
    .orderBy(asc(requestStatusEvents.createdAt));

  const files = await db
    .select({
      id: requestFiles.id,
      name: requestFiles.originalName,
      uploadedAt: requestFiles.uploadedAt,
      sizeBytes: requestFiles.sizeBytes,
    })
    .from(requestFiles)
    .where(and(eq(requestFiles.requestId, requestId), isNull(requestFiles.deletedAt)))
    .orderBy(asc(requestFiles.uploadedAt));

  const paid = await db
    .select({
      id: payments.id,
      status: payments.status,
      amountCentavos: payments.amountCentavos,
      paidOn: payments.paidOn,
      rejectionReason: payments.rejectionReason,
    })
    .from(payments)
    .where(eq(payments.requestId, requestId))
    .orderBy(asc(payments.createdAt));

  const messages = await db
    .select({ body: requestNotes.body, at: requestNotes.createdAt })
    .from(requestNotes)
    .where(and(eq(requestNotes.requestId, requestId), eq(requestNotes.visibility, "client")))
    .orderBy(desc(requestNotes.createdAt));

  return {
    id: request.id,
    trackingCode: request.trackingCode,
    serviceName: request.serviceName,
    status: request.status,
    statusLabel: STATUS_LABELS[request.status],
    createdAt: request.createdAt,
    message: request.message,
    messages,
    timeline,
    files,
    payments: paid,
    canPay: PAY_STATUSES.includes(request.status),
    canUploadMore: request.status === "waiting_for_client",
  };
}

// ---------- Profile ----------

export class AccountError extends Error {
  constructor(
    public code: "invalid" | "open-requests" | "is-admin" | "not-found",
    message: string,
  ) {
    super(message);
  }
}

export async function updateProfile(
  db: AppDb,
  userId: string,
  input: { fullName: string; phone: string | null },
  ipHash: string | null,
) {
  const fullName = input.fullName.trim();
  if (fullName.length < 2 || fullName.length > 100)
    throw new AccountError("invalid", "Please enter your full name.");
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!before) throw new AccountError("not-found", "Account not found.");
    // The role and the email are never changed here.
    await tx.update(profiles).set({ fullName, phone: input.phone }).where(eq(profiles.id, userId));
    await logAuthEvent(tx, {
      action: "profile.updated",
      userId,
      ipHash,
      details: { fields: ["fullName", "phone"] },
    });
  });
}

// ---------- Download my data ----------

// Everything we hold about the person, as plain data. Only rows with requests.user_id = this user.
export async function exportMyData(db: AppDb, userId: string, ipHash: string | null) {
  const [profile] = await db
    .select({
      email: profiles.email,
      fullName: profiles.fullName,
      phone: profiles.phone,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!profile) throw new AccountError("not-found", "Account not found.");

  const mine = await db
    .select({
      id: requests.id,
      trackingCode: requests.trackingCode,
      serviceName: services.name,
      status: requests.status,
      clientFullName: requests.clientFullName,
      clientEmail: requests.clientEmail,
      clientPhone: requests.clientPhone,
      businessName: requests.businessName,
      clientMessage: requests.clientMessage,
      publicMessage: requests.publicMessage,
      consentVersion: requests.consentVersion,
      consentAt: requests.consentAt,
      createdAt: requests.createdAt,
      submittedAt: requests.submittedAt,
      completedAt: requests.completedAt,
    })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(eq(requests.userId, userId))
    .orderBy(asc(requests.createdAt));

  const ids = mine.map((r) => r.id);
  const [files, paid, notes, events] =
    ids.length === 0
      ? [[], [], [], []]
      : await Promise.all([
          db
            .select({
              requestId: requestFiles.requestId,
              name: requestFiles.originalName,
              type: requestFiles.mimeType,
              sizeBytes: requestFiles.sizeBytes,
              uploadedAt: requestFiles.uploadedAt,
              deletedAt: requestFiles.deletedAt,
            })
            .from(requestFiles)
            .where(inArray(requestFiles.requestId, ids)),
          db
            .select({
              requestId: payments.requestId,
              status: payments.status,
              amountCentavos: payments.amountCentavos,
              paidOn: payments.paidOn,
              referenceNumber: payments.referenceNumber,
              createdAt: payments.createdAt,
            })
            .from(payments)
            .where(inArray(payments.requestId, ids)),
          db
            .select({
              requestId: requestNotes.requestId,
              body: requestNotes.body,
              createdAt: requestNotes.createdAt,
            })
            .from(requestNotes)
            .where(
              and(inArray(requestNotes.requestId, ids), eq(requestNotes.visibility, "client")),
            ),
          db
            .select({
              requestId: requestStatusEvents.requestId,
              status: requestStatusEvents.toStatus,
              at: requestStatusEvents.createdAt,
            })
            .from(requestStatusEvents)
            .where(inArray(requestStatusEvents.requestId, ids)),
        ]);

  await logAuthEvent(db, { action: "data.exported", userId, ipHash });

  return {
    exportedAt: new Date().toISOString(),
    note: "Internal notes written by our staff are not included. Uploaded files are not included, only their names.",
    profile,
    requests: mine.map((request) => ({
      ...request,
      timeline: events.filter((e) => e.requestId === request.id),
      files: files.filter((f) => f.requestId === request.id),
      payments: paid.filter((p) => p.requestId === request.id),
      messagesFromUs: notes.filter((n) => n.requestId === request.id),
    })),
  };
}

// ---------- Delete my account ----------

// What we need from Supabase Auth. A fake is used in tests.
export interface AuthDeleteApi {
  deleteUser(userId: string): Promise<void>;
}

// The caller must have checked the password again. Refused while any request is still open, and for admins.
// The files and the personal fields of every request are erased (a minimal record stays for the
// business accounts, like "Delete client data" by the owner). Then the login and the profile are removed.
export async function deleteMyAccount(
  db: AppDb,
  storage: StorageDriver,
  authApi: AuthDeleteApi,
  input: { userId: string; bucket: string; ipHash: string | null },
) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, input.userId)).limit(1);
  if (!profile) throw new AccountError("not-found", "Account not found.");
  if (isPanelRole(profile.role))
    throw new AccountError("is-admin", "An admin account cannot be deleted here.");

  const mine = await db
    .select({ id: requests.id, status: requests.status })
    .from(requests)
    .where(eq(requests.userId, input.userId));
  if (mine.some((r) => OPEN_STATUSES.includes(r.status)))
    throw new AccountError(
      "open-requests",
      "You still have an open request. Please wait until it is finished, or contact us.",
    );

  let filesDeleted = 0;
  for (const request of mine) {
    const result = await eraseRequestData(db, storage, {
      requestId: request.id,
      bucket: input.bucket,
      actor: { type: "client", id: input.userId },
      ipHash: input.ipHash,
    });
    filesDeleted += result.filesDeleted;
  }

  // Written BEFORE the login is removed. The row keeps only the id and counts, no name or email.
  await db.insert(activityLog).values({
    actorType: "client",
    actorId: input.userId,
    action: "account.deleted",
    entityType: "auth",
    entityId: input.userId,
    details: { requests: mine.length, filesDeleted },
    ipHash: input.ipHash,
  });

  // Removing the login removes the profile too (foreign key). Requests keep their rows, with user_id empty.
  await authApi.deleteUser(input.userId);
  // Without Supabase (local development) there is no cascade, so remove the profile here as well.
  await db.delete(profiles).where(eq(profiles.id, input.userId));
  return { requests: mine.length, filesDeleted };
}
