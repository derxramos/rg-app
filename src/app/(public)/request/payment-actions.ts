"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AccessError } from "@/server/auth/request-access-core";
import { requireRequestAccess } from "@/server/auth/request-access";
import { getDb } from "@/server/db/client";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";
import { notifyPaymentSubmitted } from "@/server/email/notify";
import { savePayment } from "@/server/services/payments";

export type ReceiptFormState = {
  values: Record<"paymentMethodId" | "reference" | "amount" | "paidOn", string>;
  errors: Partial<Record<string, string>>;
  formError?: string;
};

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// Saves the typed or read values. The receipt IMAGE is never sent here: only these text fields.
export async function savePaymentAction(
  requestId: string,
  _previous: ReceiptFormState,
  formData: FormData,
): Promise<ReceiptFormState> {
  const values = {
    paymentMethodId: text(formData, "paymentMethodId"),
    reference: text(formData, "reference"),
    amount: text(formData, "amount"),
    paidOn: text(formData, "paidOn"),
  };
  const fail = (formError: string, errors: ReceiptFormState["errors"] = {}) => ({
    values,
    errors,
    formError,
  });

  // 1. access (the draft cookie, or the tracking session when the status allows paying)
  let via: "draft" | "tracking";
  try {
    ({ via } = await requireRequestAccess(requestId, "pay"));
  } catch (error) {
    if (error instanceof AccessError) redirect("/request/expired");
    throw error;
  }

  // 2. rate limit: 5 payment submits per hour per request
  const db = getDb();
  const limit = await rateLimit(db, { key: `pay:req:${requestId}`, limit: 5, windowSeconds: 3600 });
  const ip = hashIp(readClientIp(await headers()));
  const byIp = await rateLimit(db, { key: `pay:ip:${ip}`, limit: 20, windowSeconds: 3600 });
  if (!limit.allowed || !byIp.allowed)
    return fail("Too many tries. Please wait a little and try again.");

  let ocrRaw: unknown = null;
  try {
    ocrRaw = JSON.parse(text(formData, "ocrRaw") || "null");
  } catch {
    ocrRaw = null;
  }

  // 3 to 6. Zod checks, duplicate check, snapshot, status
  const result = await savePayment(db, {
    requestId,
    raw: {
      ...values,
      confirmed: formData.get("confirmed") === "on",
      entryMethod: text(formData, "entryMethod"),
      ocrRaw,
    },
  });
  if (!result.ok) {
    const { form, ...fieldErrors } = result.errors;
    return fail(form ?? "Please check the fields marked below.", fieldErrors);
  }

  // A client who came from the tracking page already sent the request. Tell the admin, and go back there.
  if (via === "tracking") {
    await notifyPaymentSubmitted(requestId);
    redirect("/track/result");
  }
  redirect(`/request/${requestId}/review`);
}
