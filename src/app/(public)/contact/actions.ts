"use server";

import { headers } from "next/headers";

import { contactFormSchema, fieldErrorsFrom } from "@/lib/validation/contact";
import { getDb } from "@/server/db/client";
import { notifyContactForm } from "@/server/email/notify";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";
import { verifyTurnstile } from "@/server/security/turnstile";

export type ContactState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "invalid"; errors: Record<string, string> }
  // "failed" shows the Messenger and Viber links, so the client can still reach us (docs/FEATURES.md P5).
  | { status: "failed"; message: string };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// Contact form (docs/FEATURES.md P5): Zod, Turnstile, 5 messages per hour per visitor, then an email to the
// admin inbox with reply-to set to the client.
export async function sendContactAction(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // A hidden field that only robots fill in. We answer "success" so they learn nothing.
  if (text(formData, "website")) return { status: "success" };

  const ip = readClientIp(await headers());
  const limit = await rateLimit(getDb(), {
    key: `contact:ip:${hashIp(ip)}`,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    return {
      status: "failed",
      message: "You sent several messages already. Please try again later.",
    };
  }

  const parsed = contactFormSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    message: text(formData, "message"),
  });
  if (!parsed.success)
    return { status: "invalid", errors: fieldErrorsFrom(parsed.error) as Record<string, string> };

  // The spam check comes after the field checks, so a typo does not use up the single-use token.
  if (!(await verifyTurnstile({ token: text(formData, "cf-turnstile-response"), ip }))) {
    return { status: "failed", message: "The spam check did not pass. Please try again." };
  }

  const sent = await notifyContactForm(parsed.data);
  return sent
    ? { status: "success" }
    : { status: "failed", message: "We could not send your message right now." };
}
