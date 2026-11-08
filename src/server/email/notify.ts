import "server-only";

import { eq, and } from "drizzle-orm";

import { getBaseUrl } from "@/lib/site-url";
import { getDb } from "@/server/db/client";
import type { AppDb } from "@/server/db/types";
import { profiles } from "@/server/db/schema";
import { formatManilaDateTime } from "@/lib/time";

import { deliver, sendRequestEmail, type EmailContext } from "./send";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

import {
  accountChanged,
  contactFormAdmin,
  offlinePaymentRecordedOwner,
  paymentMethodChangedOwner,
} from "./templates";
import { formatPesos } from "@/lib/money";

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

export const notifyPaymentVerified = (requestId: string) =>
  sendRequestEmail(getDb(), emailContext(), "payment_verified_client", requestId);

export const notifyPaymentSubmitted = (requestId: string) =>
  sendRequestEmail(getDb(), emailContext(), "payment_submitted_admin", requestId);

// Status change (with an optional message) or a message alone.
export async function notifyClientUpdate(
  requestId: string,
  kind: "status" | "message",
  message: string | null,
) {
  await sendRequestEmail(
    getDb(),
    emailContext(),
    kind === "status" ? "status_changed_client" : "client_message_client",
    requestId,
    { message },
  );
}

// Alert to every active owner when a payment method was changed (threat T1).
export async function notifyPaymentMethodChanged(change: { who: string; what: string }) {
  const db = getDb();
  const ctx = emailContext();
  const owners = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(and(eq(profiles.role, "owner"), eq(profiles.isActive, true)));
  for (const owner of owners) {
    await deliver(db, ctx, {
      template: "payment_method_changed_owner",
      message: {
        to: { email: owner.email },
        ...paymentMethodChangedOwner({
          ...change,
          when: formatManilaDateTime(new Date()),
          adminUrl: `${ctx.baseUrl}/admin/activity?action=payment_method`,
        }),
      },
    });
  }
}

// Staff recorded a cash (or other offline) payment: every active owner gets an email.
export async function notifyOfflinePaymentRecorded(
  input: {
    who: string;
    requestId: string;
    trackingCode: string;
    amountCentavos: number;
    method: string;
  },
  deps: { db?: AppDb; ctx?: EmailContext } = {},
): Promise<void> {
  const db = deps.db ?? getDb();
  const ctx = deps.ctx ?? emailContext();
  const owners = await db
    .select({ email: profiles.email, fullName: profiles.fullName })
    .from(profiles)
    .where(and(eq(profiles.role, "owner"), eq(profiles.isActive, true)));
  for (const owner of owners) {
    await deliver(db, ctx, {
      template: "offline_payment_recorded_owner",
      message: {
        to: { email: owner.email, name: owner.fullName || undefined },
        ...offlinePaymentRecordedOwner({
          who: input.who,
          trackingCode: input.trackingCode,
          amount: formatPesos(input.amountCentavos),
          method: input.method,
          when: formatManilaDateTime(new Date()),
          adminUrl: `${ctx.baseUrl}/admin/requests/${input.requestId}`,
        }),
      },
    });
  }
}

// Tells a person that their account was changed, and by whom. Used for a role change, turn off / on, and a
// 2-step login reset. When the changed account is an OWNER, every active owner gets the 2-step reset email too.
export type AccountChangeNotice = {
  kind: "role_changed" | "turned_off" | "turned_on" | "2fa_reset";
  id: string;
  email: string;
  fullName: string;
  actorName: string;
  from?: Role;
  to?: Role;
  role?: Role;
};

export async function notifyAccountChange(
  change: AccountChangeNotice,
  // Tests give their own database and a fake Brevo. The app uses the real ones.
  deps: { db?: AppDb; ctx?: EmailContext } = {},
): Promise<void> {
  const db = deps.db ?? getDb();
  const ctx = deps.ctx ?? emailContext();
  const when = formatManilaDateTime(new Date());
  const loginUrl = `${ctx.baseUrl}/login`;
  const byWho = `Changed by: ${change.actorName}`;

  const content: Record<
    AccountChangeNotice["kind"],
    { template: Parameters<typeof deliver>[2]["template"]; title: string; lines: string[] }
  > = {
    role_changed: {
      template: "account_role_changed",
      title: "Your role was changed",
      lines: [
        `Your role changed from ${ROLE_LABELS[change.from ?? "user"]} to ${ROLE_LABELS[change.to ?? "user"]}.`,
        byWho,
      ],
    },
    turned_off: {
      template: "account_turned_off",
      title: "Your account was turned off",
      lines: ["Your account was turned off. You cannot sign in now.", byWho],
    },
    turned_on: {
      template: "account_turned_on",
      title: "Your account was turned on",
      lines: ["Your account was turned on again. You can sign in.", byWho],
    },
    "2fa_reset": {
      template: "account_2fa_reset",
      title: "Your 2-step login was reset",
      lines: [
        "Your 2-step login (authenticator app) was removed, and you were signed out everywhere.",
        "At your next sign in you must add a new authenticator app and a backup device.",
        byWho,
      ],
    },
  };
  const item = content[change.kind];
  await deliver(db, ctx, {
    template: item.template,
    message: {
      to: { email: change.email, name: change.fullName || undefined },
      ...accountChanged({
        title: item.title,
        name: change.fullName,
        lines: item.lines,
        when,
        loginUrl,
      }),
    },
  });

  // An owner's 2-step login was reset: every active owner must know (the person may be an owner too).
  if (change.kind === "2fa_reset" && change.role === "owner") {
    const owners = await db
      .select({ email: profiles.email, fullName: profiles.fullName })
      .from(profiles)
      .where(and(eq(profiles.role, "owner"), eq(profiles.isActive, true)));
    for (const owner of owners) {
      if (owner.email === change.email) continue; // the target already got their own email
      await deliver(db, ctx, {
        template: "account_2fa_reset_owners",
        message: {
          to: { email: owner.email, name: owner.fullName || undefined },
          ...accountChanged({
            title: "An owner's 2-step login was reset",
            name: owner.fullName,
            lines: [
              `The 2-step login of the owner ${change.fullName || change.email} was reset.`,
              byWho,
            ],
            when,
            loginUrl,
          }),
        },
      });
    }
  }
}

// The contact form. Reply-to is the client.
export async function notifyContactForm(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
}): Promise<boolean> {
  const ctx = emailContext();
  if (!ctx.adminNotifyEmail) {
    console.error("ADMIN_NOTIFY_EMAIL is not set. The contact form cannot send.");
    return false;
  }
  const result = await deliver(getDb(), ctx, {
    template: "contact_form_admin",
    message: {
      to: { email: ctx.adminNotifyEmail },
      replyTo: { email: input.email, name: input.name },
      ...contactFormAdmin(input),
    },
  });
  return result.ok;
}
