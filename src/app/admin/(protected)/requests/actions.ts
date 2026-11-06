"use server";

import { revalidatePath } from "next/cache";

import { REQUEST_STATUSES, type RequestStatus } from "@/lib/status";
import { withAdmin, type ActionResult } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import {
  addNote,
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
