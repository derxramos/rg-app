import "server-only";

// Admin reads and actions on requests. Every function takes the acting admin (actor) and checks the
// role itself, so a page or action cannot forget to (docs/FEATURES.md A3 to A5, CLAUDE.md rule 5).

import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import type { RequestStatus } from "@/lib/status";
import { parsePesosToCentavos } from "@/lib/money";
import { addDaysToIsoDate } from "@/lib/time";
import { PanelAuthError, assertCan, type PanelUser } from "@/server/auth/panel-core";
import { setActor } from "@/server/db/actor";
import {
  activityLog,
  profiles,
  emailLog,
  payments,
  requestFiles,
  requestNotes,
  requestStatusEvents,
  requests,
  services,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { changeStatus, RequestError } from "@/server/services/requests";
import type { StorageDriver } from "@/server/storage/types";

export const PAGE_SIZE = 25;

export type RequestFilters = {
  status?: RequestStatus;
  serviceId?: string;
  from?: string; // YYYY-MM-DD (Manila)
  to?: string;
  q?: string;
  page?: number;
};

// A search text must not act as a pattern ("%" or "_" would match anything).
const likeSafe = (text: string) => text.replace(/[%_\\]/g, "\\$&");
const manilaStart = (isoDate: string) => new Date(`${isoDate}T00:00:00+08:00`);

export async function listRequests(db: AppDb, filters: RequestFilters = {}) {
  const conditions = [];
  if (filters.status) conditions.push(eq(requests.status, filters.status));
  else conditions.push(ne(requests.status, "draft"));
  if (filters.serviceId) conditions.push(eq(requests.serviceId, filters.serviceId));
  if (filters.from) conditions.push(gte(requests.createdAt, manilaStart(filters.from)));
  if (filters.to)
    conditions.push(lt(requests.createdAt, manilaStart(addDaysToIsoDate(filters.to, 1))));
  if (filters.q?.trim()) {
    const pattern = `%${likeSafe(filters.q.trim())}%`;
    conditions.push(
      or(
        ilike(requests.trackingCode, pattern),
        ilike(requests.clientFullName, pattern),
        ilike(requests.clientEmail, pattern),
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = Math.max(1, filters.page ?? 1);

  const rows = await db
    .select({
      id: requests.id,
      trackingCode: requests.trackingCode,
      clientFullName: requests.clientFullName,
      serviceName: services.name,
      status: requests.status,
      createdAt: requests.createdAt,
      paymentState: sql<"not_paid" | "pending" | "verified" | "rejected">`coalesce((
        select case
          when bool_or(p.status = 'verified') then 'verified'
          when bool_or(p.status = 'pending') then 'pending'
          when bool_or(p.status = 'rejected') then 'rejected'
        end from payments p where p.request_id = ${requests.id}), 'not_paid')`,
    })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(where)
    .orderBy(desc(requests.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(requests)
    .where(where);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getRequestDetail(db: AppDb, requestId: string) {
  const [request] = await db
    .select({
      id: requests.id,
      trackingCode: requests.trackingCode,
      status: requests.status,
      serviceName: services.name,
      clientFullName: requests.clientFullName,
      clientEmail: requests.clientEmail,
      clientPhone: requests.clientPhone,
      businessName: requests.businessName,
      clientMessage: requests.clientMessage,
      consentVersion: requests.consentVersion,
      consentAt: requests.consentAt,
      publicMessage: requests.publicMessage,
      filesDeletedAt: requests.filesDeletedAt,
      createdAt: requests.createdAt,
      submittedAt: requests.submittedAt,
    })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!request) return null;

  const [files, paymentRows, events, notes] = await Promise.all([
    db
      .select({
        id: requestFiles.id,
        originalName: requestFiles.originalName,
        mimeType: requestFiles.mimeType,
        sizeBytes: requestFiles.sizeBytes,
        deletedAt: requestFiles.deletedAt,
      })
      .from(requestFiles)
      .where(eq(requestFiles.requestId, requestId))
      .orderBy(asc(requestFiles.uploadedAt)),
    db
      .select()
      .from(payments)
      .where(eq(payments.requestId, requestId))
      .orderBy(desc(payments.createdAt)),
    db
      .select({
        id: requestStatusEvents.id,
        fromStatus: requestStatusEvents.fromStatus,
        toStatus: requestStatusEvents.toStatus,
        createdAt: requestStatusEvents.createdAt,
        changedByName: profiles.fullName,
      })
      .from(requestStatusEvents)
      .leftJoin(profiles, eq(profiles.id, requestStatusEvents.changedBy))
      .where(eq(requestStatusEvents.requestId, requestId))
      .orderBy(asc(requestStatusEvents.createdAt)),
    db
      .select({
        id: requestNotes.id,
        visibility: requestNotes.visibility,
        body: requestNotes.body,
        createdAt: requestNotes.createdAt,
        authorName: profiles.fullName,
      })
      .from(requestNotes)
      .innerJoin(profiles, eq(profiles.id, requestNotes.authorId))
      .where(eq(requestNotes.requestId, requestId))
      .orderBy(desc(requestNotes.createdAt)),
  ]);

  return { request, files, payments: paymentRows, events, notes };
}

// Internal notes are for staff only. Client notes are shown on the tracking page (and emailed in Phase 6).
export async function addNote(
  db: AppDb,
  actor: PanelUser,
  input: { requestId: string; visibility: "internal" | "client"; body: string },
) {
  const body = input.body.trim();
  if (body.length < 1 || body.length > 2000) {
    throw new RequestError("not-found", "A note needs 1 to 2000 characters.");
  }
  await db.transaction(async (tx) => {
    await tx.insert(requestNotes).values({
      requestId: input.requestId,
      authorId: actor.id,
      visibility: input.visibility,
      body,
    });
    if (input.visibility === "client") {
      await tx
        .update(requests)
        .set({ publicMessage: body })
        .where(eq(requests.id, input.requestId));
      await tx.insert(activityLog).values({
        actorType: "admin",
        actorId: actor.id,
        action: "request.client_message",
        entityType: "request",
        entityId: input.requestId,
        details: { length: body.length },
      });
    }
  });
}

// Changes the status, with an optional message that the client will see.
export async function adminChangeStatus(
  db: AppDb,
  actor: PanelUser,
  input: { requestId: string; to: RequestStatus; message?: string; ipHash?: string | null },
) {
  const result = await changeStatus(db, {
    requestId: input.requestId,
    to: input.to,
    actor: "admin",
    adminId: actor.id,
    ipHash: input.ipHash,
  });
  if (input.message?.trim()) {
    await addNote(db, actor, {
      requestId: input.requestId,
      visibility: "client",
      body: input.message,
    });
  }
  return result;
}

export type PaymentActionError = "not-pending" | "not-found" | "confirm-needed" | "reason-needed";

export class PaymentActionFailure extends Error {
  constructor(public code: PaymentActionError) {
    super(code);
  }
}

// The admin must tick "I found this payment in our account" first (docs/FEATURES.md A5).
export async function verifyPayment(
  db: AppDb,
  actor: PanelUser,
  input: { paymentId: string; foundInAccount: boolean; ipHash?: string | null },
) {
  assertCan(actor, "payments.verify");
  if (input.foundInAccount !== true) throw new PaymentActionFailure("confirm-needed");

  const payment = await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const [row] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .for("update")
      .limit(1);
    if (!row) throw new PaymentActionFailure("not-found");
    if (row.status !== "pending") throw new PaymentActionFailure("not-pending");
    await tx
      .update(payments)
      .set({ status: "verified", verifiedBy: actor.id, verifiedAt: new Date() })
      .where(eq(payments.id, row.id));
    await tx.insert(activityLog).values({
      actorType: "admin",
      actorId: actor.id,
      action: "payment.verified",
      entityType: "payment",
      entityId: row.id,
      details: {
        requestId: row.requestId,
        amountCentavos: row.amountCentavos,
        reference: row.referenceNumber,
        entryMethod: row.entryMethod,
      },
      ipHash: input.ipHash ?? null,
    });
    return row;
  });

  // "Mark payment verified" also moves the request, when the rules allow it.
  const [request] = await db
    .select({ status: requests.status })
    .from(requests)
    .where(eq(requests.id, payment.requestId));
  if (request && (request.status === "payment_submitted" || request.status === "under_review")) {
    await changeStatus(db, {
      requestId: payment.requestId,
      to: "payment_verified",
      actor: "admin",
      adminId: actor.id,
      ipHash: input.ipHash,
    });
  }
  return { requestId: payment.requestId };
}

// ---------- Offline payments (cash, bank transfer, other) ----------
// For a client who chose "Skip for now. I will pay later" and then paid in the office or in another way.
// Staff, admin and owner may record it. Required: the method, the amount, the date, and a receipt number or a note
// ("Other" always needs a note). It is logged with the name of the person, and when STAFF record it the owners get an
// email. Only admin and owner may void it again.

export const OFFLINE_METHODS = ["cash", "bank_transfer", "other"] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];
export const OFFLINE_METHOD_LABELS: Record<OfflineMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export class OfflinePaymentError extends Error {
  constructor(
    public code: "invalid" | "not-found" | "wrong-status",
    message: string,
  ) {
    super(message);
  }
}

// A request can be paid for in the office while it is open or already finished. Not a draft (not sent yet)
// and not a cancelled request.
const OFFLINE_OK_STATUSES: readonly RequestStatus[] = [
  "submitted",
  "under_review",
  "waiting_for_client",
  "payment_submitted",
  "payment_verified",
  "in_progress",
  "completed",
];

export type OfflinePaymentInput = {
  requestId: string;
  method: string;
  amount: string;
  paidOn: string;
  receiptNumber?: string;
  note?: string;
  ipHash?: string | null;
};

export async function recordOfflinePayment(
  db: AppDb,
  actor: PanelUser,
  input: OfflinePaymentInput,
  now: Date = new Date(),
) {
  assertCan(actor, "payments.record_offline");

  if (!(OFFLINE_METHODS as readonly string[]).includes(input.method))
    throw new OfflinePaymentError("invalid", "Please choose how the client paid.");
  const method = input.method as OfflineMethod;
  const amount = parsePesosToCentavos(input.amount);
  if (amount === null || Number.isNaN(amount) || amount < 1 || amount > 10_000_000_000)
    throw new OfflinePaymentError(
      "invalid",
      "Please enter the amount in pesos, like 5000 or 1250.50.",
    );
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || input.paidOn > today)
    throw new OfflinePaymentError(
      "invalid",
      "Please choose the date the client paid (not in the future).",
    );
  const receipt = (input.receiptNumber ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 40);
  const note = (input.note ?? "").trim().slice(0, 300);
  if (!receipt && !note)
    throw new OfflinePaymentError(
      "invalid",
      "Please add a receipt number or a note (for example who took the cash).",
    );
  if (method === "other" && !note)
    throw new OfflinePaymentError(
      "invalid",
      'For "Other", please write in the note how the client paid.',
    );

  const result = await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const [request] = await tx
      .select({ id: requests.id, status: requests.status, trackingCode: requests.trackingCode })
      .from(requests)
      .where(eq(requests.id, input.requestId))
      .for("update")
      .limit(1);
    if (!request) throw new OfflinePaymentError("not-found", "Request not found.");
    if (!OFFLINE_OK_STATUSES.includes(request.status))
      throw new OfflinePaymentError(
        "wrong-status",
        "A payment can only be recorded for a request that was sent and is not cancelled.",
      );

    const [row] = await tx
      .insert(payments)
      .values({
        requestId: request.id,
        paymentMethodId: null,
        methodSnapshot: {
          name: OFFLINE_METHOD_LABELS[method],
          offline: true,
          recordedByName: actor.fullName,
        },
        // Without a receipt number we make a short one, so every payment has a reference.
        referenceNumber: receipt || `OFF${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        amountCentavos: amount,
        paidOn: input.paidOn,
        entryMethod: "offline",
        status: "verified",
        verifiedBy: actor.id,
        verifiedAt: now,
        offlineMethod: method,
        recordedBy: actor.id,
        note: note || null,
      })
      .returning({ id: payments.id });
    await tx.insert(activityLog).values({
      actorType: "admin",
      actorId: actor.id,
      action: "payment.recorded_offline",
      entityType: "payment",
      entityId: row.id,
      details: {
        requestId: request.id,
        trackingCode: request.trackingCode,
        method,
        amountCentavos: amount,
        paidOn: input.paidOn,
        receiptNumber: receipt || null,
        note: note || null,
        recordedByRole: actor.role,
      },
      ipHash: input.ipHash ?? null,
    });
    return {
      paymentId: row.id,
      requestId: request.id,
      status: request.status,
      trackingCode: request.trackingCode,
    };
  });

  // Mark the request as "Payment verified" when the rules allow it. From "submitted" or "waiting for client" the
  // rules need one step in between (under review).
  let status = result.status;
  if (status === "submitted" || status === "waiting_for_client") {
    await changeStatus(db, {
      requestId: result.requestId,
      to: "under_review",
      actor: "admin",
      adminId: actor.id,
      ipHash: input.ipHash,
    });
    status = "under_review";
  }
  if (status === "under_review" || status === "payment_submitted") {
    await changeStatus(db, {
      requestId: result.requestId,
      to: "payment_verified",
      actor: "admin",
      adminId: actor.id,
      ipHash: input.ipHash,
    });
  }
  return {
    paymentId: result.paymentId,
    requestId: result.requestId,
    trackingCode: result.trackingCode,
    amountCentavos: amount,
    method,
    byStaff: actor.role === "staff",
  };
}

// Admin and owner only. For a wrong entry: the payment is marked "rejected" with the reason, and the log says who and why.
// The status of the request is not changed (use "Change status" if needed).
export async function voidOfflinePayment(
  db: AppDb,
  actor: PanelUser,
  input: { paymentId: string; reason: string; ipHash?: string | null },
) {
  assertCan(actor, "payments.void");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300)
    throw new OfflinePaymentError("invalid", "Please write why (3 to 300 characters).");
  return db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const [row] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .for("update")
      .limit(1);
    if (!row) throw new OfflinePaymentError("not-found", "Payment not found.");
    if (row.entryMethod !== "offline" || row.status !== "verified")
      throw new OfflinePaymentError(
        "wrong-status",
        "Only a recorded offline payment can be voided.",
      );
    await tx
      .update(payments)
      .set({ status: "rejected", rejectionReason: `Voided: ${reason}` })
      .where(eq(payments.id, row.id));
    await tx.insert(activityLog).values({
      actorType: "admin",
      actorId: actor.id,
      action: "payment.voided",
      entityType: "payment",
      entityId: row.id,
      details: {
        requestId: row.requestId,
        amountCentavos: row.amountCentavos,
        reason,
        recordedBy: row.recordedBy,
      },
      ipHash: input.ipHash ?? null,
    });
    return { requestId: row.requestId };
  });
}

export async function rejectPayment(
  db: AppDb,
  actor: PanelUser,
  input: { paymentId: string; reason: string; ipHash?: string | null },
) {
  assertCan(actor, "payments.verify");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) throw new PaymentActionFailure("reason-needed");

  const payment = await db.transaction(async (tx) => {
    await setActor(tx, actor.id);
    const [row] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .for("update")
      .limit(1);
    if (!row) throw new PaymentActionFailure("not-found");
    if (row.status !== "pending") throw new PaymentActionFailure("not-pending");
    await tx
      .update(payments)
      .set({ status: "rejected", rejectionReason: reason })
      .where(eq(payments.id, row.id));
    // The client sees a simple message on the tracking page.
    await tx
      .update(requests)
      .set({ publicMessage: `We could not confirm your payment. ${reason}` })
      .where(eq(requests.id, row.requestId));
    await tx.insert(activityLog).values({
      actorType: "admin",
      actorId: actor.id,
      action: "payment.rejected",
      entityType: "payment",
      entityId: row.id,
      details: { requestId: row.requestId, reference: row.referenceNumber, reason },
      ipHash: input.ipHash ?? null,
    });
    return row;
  });

  const [request] = await db
    .select({ status: requests.status })
    .from(requests)
    .where(eq(requests.id, payment.requestId));
  if (request?.status === "payment_submitted") {
    await changeStatus(db, {
      requestId: payment.requestId,
      to: "waiting_for_client",
      actor: "admin",
      adminId: actor.id,
      ipHash: input.ipHash,
    });
  }
  return { requestId: payment.requestId };
}

// A link that works for 60 seconds. Every open is written to the activity log (docs/ARCHITECTURE.md section 6).
export async function getFileLink(
  db: AppDb,
  storage: StorageDriver,
  actor: PanelUser,
  input: { fileId: string; bucket: string; ipHash?: string | null },
): Promise<string | null> {
  const [file] = await db
    .select()
    .from(requestFiles)
    .where(eq(requestFiles.id, input.fileId))
    .limit(1);
  if (!file || file.deletedAt) return null;
  await db.insert(activityLog).values({
    actorType: "admin",
    actorId: actor.id,
    action: "file.opened",
    entityType: "request_file",
    entityId: file.id,
    details: { requestId: file.requestId, name: file.originalName },
    ipHash: input.ipHash ?? null,
  });
  return storage.signedUrl(input.bucket, file.storagePath, 60);
}

// ---------- Delete client data (a privacy request) ----------
// docs/SECURITY_AND_PRIVACY.md section 2, "Data subject rights". The client asks us to delete their information.
// We delete the files and clear every personal field. We keep a minimal record (the code, the service, the dates
// and the payment values) because the business may need it for its accounts. Owner only, fresh 2FA, logged.

export const ERASED_NAME = "Deleted client";

// Who asked for the erase: an owner (admin) or the client themself (account deletion).
export type EraseActor = { type: "admin" | "client"; id: string | null };

export async function eraseClientData(
  db: AppDb,
  storage: StorageDriver,
  actor: PanelUser,
  input: { requestId: string; bucket: string; fresh2fa: boolean; ipHash?: string | null },
) {
  assertCan(actor, "requests.erase_client_data");
  if (!input.fresh2fa) throw new PanelAuthError("needs-fresh-2fa");
  return eraseRequestData(db, storage, {
    requestId: input.requestId,
    bucket: input.bucket,
    ipHash: input.ipHash,
    actor: { type: "admin", id: actor.id },
  });
}

// The work itself. The CALLER must have checked who may do this (owner + fresh 2FA, or the account owner).
export async function eraseRequestData(
  db: AppDb,
  storage: StorageDriver,
  input: { requestId: string; bucket: string; actor: EraseActor; ipHash?: string | null },
) {
  const [request] = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.id, input.requestId))
    .limit(1);
  if (!request) throw new PaymentActionFailure("not-found");

  // Files first. If storage fails, nothing else is changed.
  const files = await db
    .select({ id: requestFiles.id, path: requestFiles.storagePath })
    .from(requestFiles)
    .where(and(eq(requestFiles.requestId, input.requestId), isNull(requestFiles.deletedAt)));
  if (files.length > 0)
    await storage.remove(
      input.bucket,
      files.map((f) => f.path),
    );

  await db.transaction(async (tx) => {
    const now = new Date();
    if (files.length > 0) {
      await tx
        .update(requestFiles)
        .set({ deletedAt: now, originalName: "deleted" })
        .where(
          inArray(
            requestFiles.id,
            files.map((f) => f.id),
          ),
        );
    }
    await tx
      .update(requests)
      .set({
        clientFullName: ERASED_NAME,
        clientEmail: "deleted@example.invalid",
        clientPhone: "+630000000000",
        clientPhoneLast4: "0000",
        businessName: null,
        clientMessage: null,
        publicMessage: null,
        filesDeletedAt: now,
      })
      .where(eq(requests.id, input.requestId));
    // Notes can hold personal details too.
    await tx
      .update(requestNotes)
      .set({ body: "[deleted]" })
      .where(eq(requestNotes.requestId, input.requestId));
    await tx
      .update(emailLog)
      .set({ toEmail: "deleted@example.invalid" })
      .where(eq(emailLog.requestId, input.requestId));
    await tx.insert(activityLog).values({
      actorType: input.actor.type,
      actorId: input.actor.id,
      action: "request.data_erased",
      entityType: "request",
      entityId: input.requestId,
      details: { filesDeleted: files.length },
      ipHash: input.ipHash ?? null,
    });
  });
  return { filesDeleted: files.length };
}
