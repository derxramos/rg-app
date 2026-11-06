"use server";

import { revalidatePath } from "next/cache";

import { REQUEST_STATUSES, type RequestStatus } from "@/lib/status";
import { withAdmin, type ActionResult } from "@/server/auth/admin";
import { OWNER_ONLY } from "@/server/auth/admin-core";
import { getDb } from "@/server/db/client";
import { CLIENT_FILES_BUCKET, getStorage } from "@/server/storage/storage";
import { emailContext, notifyClientUpdate } from "@/server/email/notify";
import { EMAIL_STATUSES, retryEmail } from "@/server/email/send";
import {
  addNote,
  eraseClientData,
  adminChangeStatus,
  rejectPayment,
  verifyPayment,
} from "@/server/services/admin-requests";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export async function changeStatusAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ formData }, async ({ admin, ipHash }) => {
    const to = text(formData, "to") as RequestStatus;
    if (!REQUEST_STATUSES.includes(to))
      return { ok: false, code: "invalid", message: "Please choose a status." };
    const requestId = text(formData, "requestId");
    await adminChangeStatus(getDb(), admin, {
      requestId,
      to,
      message: text(formData, "message"),
      ipHash,
    });
    // Email the client for the important statuses, and always when a message was written.
    const message = text(formData, "message").trim();
    if (EMAIL_STATUSES.includes(to) || message)
      await notifyClientUpdate(requestId, "status", message || null);
    revalidatePath(`/admin/requests/${requestId}`);
    return { ok: true, message: "Status changed." };
  });
}

export async function addNoteAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ formData }, async ({ admin }) => {
    const visibility = text(formData, "visibility") === "client" ? "client" : "internal";
    const requestId = text(formData, "requestId");
    await addNote(getDb(), admin, { requestId, visibility, body: text(formData, "body") });
    if (visibility === "client")
      await notifyClientUpdate(requestId, "message", text(formData, "body").trim());
    revalidatePath(`/admin/requests/${requestId}`);
    return {
      ok: true,
      message: visibility === "client" ? "Message saved. The client can see it." : "Note saved.",
    };
  });
}

export async function verifyPaymentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ formData }, async ({ admin, ipHash }) => {
    try {
      const { requestId } = await verifyPayment(getDb(), admin, {
        paymentId: text(formData, "paymentId"),
        foundInAccount: formData.get("found") === "on",
        ipHash,
      });
      revalidatePath(`/admin/requests/${requestId}`);
      return { ok: true, message: "Payment marked as verified." };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "confirm-needed")
        return {
          ok: false,
          code: "invalid",
          message: "Please tick the box to say you found this payment in your account.",
        };
      if (code === "not-pending")
        return { ok: false, code: "invalid", message: "This payment was already checked." };
      throw error;
    }
  });
}

export async function rejectPaymentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ formData }, async ({ admin, ipHash }) => {
    try {
      const { requestId } = await rejectPayment(getDb(), admin, {
        paymentId: text(formData, "paymentId"),
        reason: text(formData, "reason"),
        ipHash,
      });
      revalidatePath(`/admin/requests/${requestId}`);
      return { ok: true, message: "Payment rejected. The client will see your message." };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "reason-needed")
        return {
          ok: false,
          code: "invalid",
          message: "Please write a short reason (3 to 300 characters).",
        };
      if (code === "not-pending")
        return { ok: false, code: "invalid", message: "This payment was already checked." };
      throw error;
    }
  });
}

// The "Retry" button next to an email that was not sent (docs/FEATURES.md A12).
export async function retryEmailAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ formData }, async () => {
    const result = await retryEmail(getDb(), emailContext(), text(formData, "logId"));
    revalidatePath(`/admin/requests/${text(formData, "requestId")}`);
    return result.ok
      ? { ok: true, message: "The email was sent." }
      : {
          ok: false,
          code: "invalid",
          message:
            "The email could not be sent again. Check the email settings, then try once more.",
        };
  });
}

// "Delete client data" (a privacy request). OWNER ONLY, a fresh 2FA code, and the word DELETE typed in.
export async function eraseClientDataAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin, ipHash, fresh2fa }) => {
    if (text(formData, "confirm").trim() !== "DELETE") {
      return {
        ok: false,
        code: "invalid",
        message: "Please type the word DELETE (in capital letters) to confirm.",
      };
    }
    const requestId = text(formData, "requestId");
    const { filesDeleted } = await eraseClientData(getDb(), getStorage(), admin, {
      requestId,
      bucket: CLIENT_FILES_BUCKET(),
      fresh2fa,
      ipHash,
    });
    revalidatePath(`/admin/requests/${requestId}`);
    return { ok: true, message: `The client's data was deleted (${filesDeleted} files).` };
  });
}
