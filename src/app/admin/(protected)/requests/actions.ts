"use server";

import { revalidatePath } from "next/cache";

import { REQUEST_STATUSES, type RequestStatus } from "@/lib/status";
import { withPanel, type ActionResult } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { CLIENT_FILES_BUCKET, getStorage } from "@/server/storage/storage";
import {
  emailContext,
  notifyClientUpdate,
  notifyOfflinePaymentRecorded,
  notifyPaymentVerified,
} from "@/server/email/notify";
import { EMAIL_STATUSES, retryEmail } from "@/server/email/send";
import {
  addNote,
  eraseClientData,
  adminChangeStatus,
  recordOfflinePayment,
  voidOfflinePayment,
  rejectPayment,
  verifyPayment,
} from "@/server/services/admin-requests";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export async function changeStatusAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "requests.change_status", formData }, async ({ admin, ipHash }) => {
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
  return withPanel({ action: "requests.add_note", formData }, async ({ admin }) => {
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
  return withPanel({ action: "payments.verify", formData }, async ({ admin, ipHash }) => {
    try {
      const { requestId } = await verifyPayment(getDb(), admin, {
        paymentId: text(formData, "paymentId"),
        foundInAccount: formData.get("found") === "on",
        ipHash,
      });
      // A simple acknowledgment email for the client (not an official receipt).
      await notifyPaymentVerified(requestId);
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

// "Record a payment" for a client who paid in the office (cash, bank transfer, other). Staff may do it.
export async function recordOfflinePaymentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "payments.record_offline", formData }, async ({ admin, ipHash }) => {
    const result = await recordOfflinePayment(getDb(), admin, {
      requestId: text(formData, "requestId"),
      method: text(formData, "method"),
      amount: text(formData, "amount"),
      paidOn: text(formData, "paidOn"),
      receiptNumber: text(formData, "receiptNumber"),
      note: text(formData, "note"),
      ipHash,
    });
    // The client gets the "payment received" email. When STAFF recorded it, every owner is told too.
    await notifyPaymentVerified(result.requestId);
    if (result.byStaff) {
      await notifyOfflinePaymentRecorded({
        who: admin.fullName,
        requestId: result.requestId,
        trackingCode: result.trackingCode,
        amountCentavos: result.amountCentavos,
        method: result.method,
      });
    }
    revalidatePath(`/admin/requests/${result.requestId}`);
    return { ok: true, message: "The payment was recorded and the request is marked as paid." };
  });
}

// Admin and owner only: undo a wrong offline payment (with a reason).
export async function voidOfflinePaymentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "payments.void", formData }, async ({ admin, ipHash }) => {
    const { requestId } = await voidOfflinePayment(getDb(), admin, {
      paymentId: text(formData, "paymentId"),
      reason: text(formData, "reason"),
      ipHash,
    });
    revalidatePath(`/admin/requests/${requestId}`);
    return { ok: true, message: "The payment was voided." };
  });
}

export async function rejectPaymentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "payments.verify", formData }, async ({ admin, ipHash }) => {
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
  return withPanel({ action: "requests.retry_email", formData }, async () => {
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
  return withPanel(
    { action: "requests.erase_client_data", formData },
    async ({ admin, ipHash, fresh2fa }) => {
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
    },
  );
}
