import "server-only";

// Sending with a log. Every email is saved in email_log (status, Brevo id, a short error), which also lets us
// count today's emails against the Brevo free limit (300 per day). A failed email NEVER throws: the main
// action still works, and the admin sees "Email not sent" with a Retry button (docs/FEATURES.md A12).
import { and, count, desc, eq, gte } from "drizzle-orm";

import { STATUS_LABELS, type RequestStatus } from "@/lib/status";
import { formatPesos } from "@/lib/money";
import { formatManilaDate } from "@/lib/time";
import { emailLog, payments, requests, services } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

import { sendWithBrevo, type BrevoConfig, type EmailMessage, type SendResult } from "./brevo";
import * as templates from "./templates";

export const DAILY_EMAIL_LIMIT = 300;

export type EmailTemplateKey =
  | "request_submitted_admin"
  | "request_submitted_client"
  | "payment_submitted_admin"
  | "payment_verified_client"
  | "status_changed_client"
  | "client_message_client"
  | "payment_method_changed_owner"
  | "contact_form_admin"
  | "account_role_changed"
  | "account_turned_off"
  | "account_turned_on"
  | "account_2fa_reset"
  | "account_2fa_reset_owners";

// Templates tied to one request can be rebuilt from the database, so they can be retried.
export const RETRYABLE: readonly EmailTemplateKey[] = [
  "request_submitted_admin",
  "request_submitted_client",
  "payment_submitted_admin",
  "payment_verified_client",
  "status_changed_client",
  "client_message_client",
];

export type EmailContext = {
  brevo: BrevoConfig;
  baseUrl: string;
  adminNotifyEmail: string | undefined;
  fetchImpl?: typeof fetch;
  now?: Date;
};

const startOfManilaDay = (now: Date) =>
  new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now)}T00:00:00+08:00`,
  );

export async function emailsSentToday(db: AppDb, now: Date = new Date()): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(emailLog)
    .where(and(gte(emailLog.createdAt, startOfManilaDay(now)), eq(emailLog.status, "sent")));
  return n;
}

// Sends one email and writes the log row. Returns the log id and whether it was sent.
export async function deliver(
  db: AppDb,
  ctx: EmailContext,
  input: { template: EmailTemplateKey; message: EmailMessage; requestId?: string | null },
): Promise<{ logId: string; ok: boolean }> {
  let result: SendResult;
  try {
    if ((await emailsSentToday(db, ctx.now)) >= DAILY_EMAIL_LIMIT) {
      result = { ok: false, error: "The daily email limit (300) was reached." };
    } else {
      result = await sendWithBrevo(input.message, ctx.brevo, ctx.fetchImpl);
    }
  } catch (error) {
    result = { ok: false, error: "Email could not be sent." };
    console.error("Email error:", error);
  }

  try {
    const [row] = await db
      .insert(emailLog)
      .values({
        template: input.template,
        toEmail: input.message.to.email,
        requestId: input.requestId ?? null,
        status: result.ok ? "sent" : "failed",
        providerMessageId: result.ok ? result.messageId : null,
        error: result.ok ? null : result.error.slice(0, 300),
      })
      .returning({ id: emailLog.id });
    return { logId: row.id, ok: result.ok };
  } catch (error) {
    // Even the log failed. The main action must still go on.
    console.error("Could not write email_log:", error);
    return { logId: "", ok: false };
  }
}

type RequestMailData = {
  id: string;
  trackingCode: string;
  status: RequestStatus;
  clientFullName: string;
  clientEmail: string;
  publicMessage: string | null;
  serviceName: string;
};

async function loadRequest(db: AppDb, requestId: string): Promise<RequestMailData | null> {
  const [row] = await db
    .select({
      id: requests.id,
      trackingCode: requests.trackingCode,
      status: requests.status,
      clientFullName: requests.clientFullName,
      clientEmail: requests.clientEmail,
      publicMessage: requests.publicMessage,
      serviceName: services.name,
    })
    .from(requests)
    .innerJoin(services, eq(services.id, requests.serviceId))
    .where(eq(requests.id, requestId))
    .limit(1);
  return row ?? null;
}

// Builds the message for a request email. Used for the first send and for Retry.
async function buildRequestMessage(
  db: AppDb,
  ctx: EmailContext,
  template: EmailTemplateKey,
  r: RequestMailData,
  override?: { message?: string | null },
): Promise<EmailMessage | null> {
  const adminUrl = `${ctx.baseUrl}/admin/requests/${r.id}`;
  const trackUrl = `${ctx.baseUrl}/track`;
  const toClient = { email: r.clientEmail, name: r.clientFullName };
  const toAdmin = ctx.adminNotifyEmail ? { email: ctx.adminNotifyEmail } : null;
  const message = override?.message !== undefined ? override.message : r.publicMessage;

  switch (template) {
    case "request_submitted_client":
      return {
        to: toClient,
        ...templates.requestSubmittedClient({
          name: r.clientFullName,
          trackingCode: r.trackingCode,
          trackUrl,
        }),
      };
    case "request_submitted_admin":
      return toAdmin
        ? {
            to: toAdmin,
            ...templates.requestSubmittedAdmin({
              trackingCode: r.trackingCode,
              serviceName: r.serviceName,
              clientName: r.clientFullName,
              adminUrl,
            }),
          }
        : null;
    case "status_changed_client":
      return {
        to: toClient,
        ...templates.statusChangedClient({
          name: r.clientFullName,
          trackingCode: r.trackingCode,
          statusLabel: STATUS_LABELS[r.status],
          message,
          trackUrl,
        }),
      };
    case "client_message_client":
      return message
        ? {
            to: toClient,
            ...templates.clientMessageClient({
              name: r.clientFullName,
              trackingCode: r.trackingCode,
              message,
              trackUrl,
            }),
          }
        : null;
    case "payment_submitted_admin": {
      const [pay] = await db
        .select()
        .from(payments)
        .where(eq(payments.requestId, r.id))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      if (!pay || !toAdmin) return null;
      return {
        to: toAdmin,
        ...templates.paymentSubmittedAdmin({
          trackingCode: r.trackingCode,
          amount: formatPesos(pay.amountCentavos),
          method: (pay.methodSnapshot as { name?: string }).name ?? "payment",
          reference: pay.referenceNumber,
          adminUrl,
        }),
      };
    }
    case "payment_verified_client": {
      const [pay] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.requestId, r.id), eq(payments.status, "verified")))
        .orderBy(desc(payments.verifiedAt))
        .limit(1);
      if (!pay) return null;
      return {
        to: toClient,
        ...templates.paymentVerifiedClient({
          name: r.clientFullName,
          trackingCode: r.trackingCode,
          amount: formatPesos(pay.amountCentavos),
          method: (pay.methodSnapshot as { name?: string }).name ?? "payment",
          reference: pay.referenceNumber,
          paidOn: formatManilaDate(`${pay.paidOn}T00:00:00+08:00`),
          trackUrl,
        }),
      };
    }
    default:
      return null;
  }
}

// Sends one of the request emails. Never throws.
export async function sendRequestEmail(
  db: AppDb,
  ctx: EmailContext,
  template: EmailTemplateKey,
  requestId: string,
  override?: { message?: string | null },
): Promise<{ ok: boolean }> {
  try {
    const request = await loadRequest(db, requestId);
    if (!request) return { ok: false };
    const message = await buildRequestMessage(db, ctx, template, request, override);
    if (!message) {
      // For example ADMIN_NOTIFY_EMAIL is not set. Write it down so it shows in the admin area.
      await db.insert(emailLog).values({
        template,
        toEmail: "(not set)",
        requestId,
        status: "failed",
        error: "No recipient. Check ADMIN_NOTIFY_EMAIL.",
      });
      return { ok: false };
    }
    return { ok: (await deliver(db, ctx, { template, message, requestId })).ok };
  } catch (error) {
    console.error("sendRequestEmail failed:", error);
    return { ok: false };
  }
}

// The Retry button. Builds the email again from the database and sends it. A new log row is written.
export async function retryEmail(
  db: AppDb,
  ctx: EmailContext,
  logId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await db.select().from(emailLog).where(eq(emailLog.id, logId)).limit(1);
  if (!row) return { ok: false, reason: "not-found" };
  if (row.status !== "failed") return { ok: false, reason: "not-failed" };
  if (!row.requestId || !RETRYABLE.includes(row.template as EmailTemplateKey))
    return { ok: false, reason: "cannot-retry" };
  return sendRequestEmail(db, ctx, row.template as EmailTemplateKey, row.requestId);
}

export async function listEmailsForRequest(db: AppDb, requestId: string) {
  return db
    .select({
      id: emailLog.id,
      template: emailLog.template,
      toEmail: emailLog.toEmail,
      status: emailLog.status,
      error: emailLog.error,
      createdAt: emailLog.createdAt,
    })
    .from(emailLog)
    .where(eq(emailLog.requestId, requestId))
    .orderBy(desc(emailLog.createdAt));
}

// Statuses that email the client. Quiet ones (submitted, under review) do not.
export const EMAIL_STATUSES: readonly RequestStatus[] = [
  "waiting_for_client",
  "payment_verified",
  "in_progress",
  "completed",
  "cancelled",
];
