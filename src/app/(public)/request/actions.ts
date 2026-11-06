"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { requestDetailsSchema, requestFieldErrors } from "@/lib/validation/request";
import { AccessError } from "@/server/auth/request-access-core";
import { DONE_COOKIE, requireRequestAccess, setDraftCookie } from "@/server/auth/request-access";
import { getDb } from "@/server/db/client";
import { getTokenSecret, isProduction } from "@/server/env";
import { hashIp, readClientIp } from "@/server/security/client-ip";
import { rateLimit } from "@/server/security/rate-limit";
import { signValue } from "@/server/security/tokens";
import { verifyTurnstile } from "@/server/security/turnstile";
import { removeFile } from "@/server/services/files";
import { listPaymentsForRequest } from "@/server/services/payments";
import { changeStatus, createDraft, RequestError } from "@/server/services/requests";
import { readSetting } from "@/server/services/settings";
import { CLIENT_FILES_BUCKET, getStorage } from "@/server/storage/storage";

export type DraftFormState = {
  values: Record<
    "serviceSlug" | "fullName" | "email" | "phone" | "businessName" | "message",
    string
  >;
  errors: Partial<Record<string, string>>;
  formError?: string;
};

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// Step 1: saves a Draft, makes the tracking code, sets the draft cookie, and goes to the code page.
export async function createDraftAction(
  _previous: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const values = {
    serviceSlug: text(formData, "serviceSlug"),
    fullName: text(formData, "fullName"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    businessName: text(formData, "businessName"),
    message: text(formData, "message"),
  };
  const fail = (formError: string, errors: DraftFormState["errors"] = {}): DraftFormState => ({
    values,
    errors,
    formError,
  });

  // A hidden field that people leave empty and robots fill in.
  if (text(formData, "website")) return fail("We could not send your request. Please try again.");

  const db = getDb();
  const ip = readClientIp(await headers());

  // 5 new drafts per hour per visitor (docs/FEATURES.md P7).
  const limit = await rateLimit(db, {
    key: `draft:ip:${hashIp(ip)}`,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return fail(
      `Too many requests from this device. Please try again in about ${minutes} minutes.`,
    );
  }

  if (!(await verifyTurnstile({ token: text(formData, "cf-turnstile-response"), ip }))) {
    return fail("The spam check did not pass. Please try again.");
  }

  const parsed = requestDetailsSchema.safeParse({
    ...values,
    consent: formData.get("consent") === "on" ? true : false,
  });
  if (!parsed.success)
    return fail("Please check the fields marked below.", requestFieldErrors(parsed.error));

  let created;
  try {
    const consentVersion = await readSetting(db, "privacy_notice_version");
    created = await createDraft(db, parsed.data, { consentVersion, secret: getTokenSecret() });
  } catch (error) {
    if (error instanceof RequestError && error.code === "service-not-found") {
      return fail("Please check the fields marked below.", {
        serviceSlug: "That service is not available.",
      });
    }
    console.error("createDraft failed:", error);
    return fail("We could not save your request. Please try again, or contact us.");
  }

  await setDraftCookie(created.requestId, created.token, created.draftExpiresAt);
  redirect(`/request/${created.requestId}/code`);
}

export async function removeFileAction(
  requestId: string,
  fileId: string,
): Promise<{ ok: boolean }> {
  try {
    await requireRequestAccess(requestId, "removeFile");
  } catch (error) {
    if (error instanceof AccessError) return { ok: false };
    throw error;
  }
  const ok = await removeFile(getDb(), getStorage(), {
    requestId,
    fileId,
    bucket: CLIENT_FILES_BUCKET(),
  });
  return { ok };
}

// The last step: sends the request. Phase 4 changes the target to "payment submitted" when a payment exists.
export async function submitRequestAction(requestId: string): Promise<void> {
  let request;
  try {
    ({ request } = await requireRequestAccess(requestId, "submit"));
  } catch (error) {
    if (error instanceof AccessError) redirect("/request/expired");
    throw error;
  }

  // With a payment, the request goes to "payment submitted". Without one, to "submitted" (docs/FEATURES.md P11).
  const db = getDb();
  const hasPayment = (await listPaymentsForRequest(db, requestId)).length > 0;
  await changeStatus(db, {
    requestId,
    to: hasPayment ? "payment_submitted" : "submitted",
    actor: "client",
  });

  // The draft cookie stops working after submit, so a short signed cookie lets the "done" page
  // show the code once more.
  const jar = await cookies();
  jar.set(DONE_COOKIE, signValue(getTokenSecret(), `${requestId}|${request.trackingCode}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: 60 * 10,
  });
  redirect(`/request/${requestId}/done`);
}
