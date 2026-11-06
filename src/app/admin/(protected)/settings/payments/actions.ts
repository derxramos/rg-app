"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { OWNER_ONLY } from "@/server/auth/admin-core";
import { withAdmin, type ActionResult } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { detectFileType } from "@/server/security/file-type";
import {
  deletePaymentMethod,
  movePaymentMethod,
  savePaymentMethod,
  setPaymentMethodActive,
} from "@/server/services/admin-settings";
import { PUBLIC_ASSETS_BUCKET, getStorage } from "@/server/storage/storage";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const MAX_QR_BYTES = 2 * 1024 * 1024;

// Saves a payment method. OWNER ONLY. Changing the QR, account name or number (or adding a method)
// needs a fresh 2FA code. A new QR picture gets a NEW random file name, so the old one stays for comparing.
export async function savePaymentMethodAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let newId: string | null = null;
  const result = await withAdmin(
    { roles: OWNER_ONLY, formData },
    async ({ admin, ipHash, fresh2fa }) => {
      let newQrImagePath: string | undefined;
      const file = formData.get("qr");
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_QR_BYTES)
          return {
            ok: false,
            code: "invalid",
            message: "The QR picture is too big (2 MB at most).",
          };
        const bytes = new Uint8Array(await file.arrayBuffer());
        const type = detectFileType(bytes);
        if (!type || type.ext === "pdf")
          return { ok: false, code: "invalid", message: "The QR picture must be a JPG or PNG." };
        // Check the fresh code BEFORE saving the file, so a wrong code leaves nothing behind.
        if (!fresh2fa)
          return {
            ok: false,
            code: "needs-fresh-2fa",
            message:
              "Please type a fresh 6-digit code from your authenticator app, then save again.",
          };
        newQrImagePath = `qr/${randomUUID()}.${type.ext}`;
        await getStorage().put(PUBLIC_ASSETS_BUCKET(), newQrImagePath, bytes, type.mime);
      }

      const id = text(formData, "id");
      const saved = await savePaymentMethod(
        getDb(),
        admin,
        {
          id: id && id !== "new" ? id : undefined,
          name: text(formData, "name"),
          parserKey: text(formData, "parserKey") || null,
          accountName: text(formData, "accountName"),
          accountNumber: text(formData, "accountNumber"),
          instructions: text(formData, "instructions"),
          newQrImagePath,
          isActive: formData.get("isActive") === "on",
        },
        { fresh2fa, ipHash },
      );
      // Phase 6 sends the "payment method changed" alert email to the owner when saved.risky is true.
      if (!id || id === "new") newId = saved.id;
      revalidatePath("/admin/settings/payments");
      return {
        ok: true,
        message: saved.risky ? "Saved. This change is in the activity log." : "Saved.",
      };
    },
  );
  if (result.ok && newId) redirect(`/admin/settings/payments/${newId}`);
  return result;
}

export async function paymentMethodListAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin }) => {
    const db = getDb();
    const id = text(formData, "id");
    const intent = text(formData, "intent");
    if (intent === "up" || intent === "down") await movePaymentMethod(db, admin, id, intent);
    else if (intent === "on" || intent === "off")
      await setPaymentMethodActive(db, admin, id, intent === "on");
    else return { ok: false, code: "invalid", message: "Unknown action." };
    revalidatePath("/admin/settings/payments");
    return { ok: true, message: "Done." };
  });
}

export async function deletePaymentMethodAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let deleted = false;
  const result = await withAdmin({ roles: OWNER_ONLY, formData }, async ({ admin, fresh2fa }) => {
    await deletePaymentMethod(getDb(), admin, text(formData, "id"), { fresh2fa });
    deleted = true;
    return { ok: true, message: "Deleted." };
  });
  if (deleted) redirect("/admin/settings/payments");
  return result;
}
