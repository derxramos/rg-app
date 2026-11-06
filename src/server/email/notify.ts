import "server-only";

import { eq, and } from "drizzle-orm";

import { getBaseUrl } from "@/lib/site-url";
import { getDb } from "@/server/db/client";
import { adminProfiles } from "@/server/db/schema";
import { formatManilaDateTime } from "@/lib/time";

import { deliver, sendRequestEmail, type EmailContext } from "./send";
import { paymentMethodChangedOwner, contactFormAdmin } from "./templates";

// The settings come from the environment (docs/ARCHITECTURE.md, "Environment variables").
export function emailContext(): EmailContext {
  return {
    brevo: {
      apiKey: process.env.BREVO_API_KEY?.trim(),
      fromAddress: process.env.EMAIL_FROM_ADDRESS?.trim(),
      fromName: process.env.EMAIL_FROM_NAME?.trim(),
    },
    baseUrl: getBaseUrl(),
    adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL?.trim() || undefined,
  };
}

// When a request is sent: the admin gets "new request" and the client gets the tracking code.
export async function notifyRequestSubmitted(requestId: string, hasPayment: boolean) {
  const db = getDb();
  const ctx = emailContext();
  await sendRequestEmail(db, ctx, "request_submitted_admin", requestId);
  await sendRequestEmail(db, ctx, "request_submitted_client", requestId);
  if (hasPayment) await sendRequestEmail(db, ctx, "payment_submitted_admin", requestId);
}

export const notifyPaymentSubmitted = (requestId: string) =>
  sendRequestEmail(getDb(), emailContext(), "payment_submitted_admin", requestId);

// Status change (with an optional message) or a message alone.
export async function notifyClientUpdate(requestId: string, kind: "status" | "message", message: string | null) {
  await sendRequestEmail(getDb(), emailContext(), kind === "status" ? "status_changed_client" : "client_message_client", requestId, { message });
}

// Alert to every active owner when a payment method was changed (threat T1).
export async function notifyPaymentMethodChanged(change: { who: string; what: string }) {
  const db = getDb();
  const ctx = emailContext();
  const owners = await db.select({ email: adminProfiles.email }).from(adminProfiles).where(and(eq(adminProfiles.role, "owner"), eq(adminProfiles.isActive, true)));
  for (const owner of owners) {
    await deliver(db, ctx, {
      template: "payment_method_changed_owner",
      message: { to: { email: owner.email }, ...paymentMethodChangedOwner({ ...change, when: formatManilaDateTime(new Date()), adminUrl: `${ctx.baseUrl}/admin/activity?action=payment_method` }) },
    });
  }
}

// The contact form. Reply-to is the client.
export async function notifyContactForm(input: { name: string; email: string; phone: string; message: string }): Promise<boolean> {
  const ctx = emailContext();
  if (!ctx.adminNotifyEmail) {
    console.error("ADMIN_NOTIFY_EMAIL is not set. The contact form cannot send.");
    return false;
  }
  const result = await deliver(getDb(), ctx, {
    template: "contact_form_admin",
    message: { to: { email: ctx.adminNotifyEmail }, replyTo: { email: input.email, name: input.name }, ...contactFormAdmin(input) },
  });
  return result.ok;
}
