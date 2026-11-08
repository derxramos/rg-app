"use server";

import { revalidatePath } from "next/cache";

import { recordDeviceEvent } from "@/server/auth/device-log";
import { createMfaApi } from "@/server/auth/mfa-api";
import { DeviceError, removeDevice, verifiedOf } from "@/server/auth/mfa-devices";
import { withPanel, type ActionResult } from "@/server/auth/panel";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// Remove one of my own devices. The code must come from ANOTHER device, and the last device is never removed.
// (The form field is named "code", not the usual confirm field, because this check IS the confirm.)
export async function removeDeviceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "security.self", formData }, async ({ admin }) => {
    const api = await createMfaApi();
    try {
      const removed = await removeDevice(api, {
        factorId: text(formData, "factorId"),
        code: text(formData, "code"),
      });
      const left = verifiedOf(await api.list()).length;
      await recordDeviceEvent(admin.id, "mfa.device_removed", {
        device: removed.name,
        devicesLeft: left,
      });
      revalidatePath("/admin/security");
      return { ok: true, message: `The device "${removed.name}" was removed.` };
    } catch (error) {
      if (error instanceof DeviceError)
        return { ok: false, code: "invalid", message: error.message };
      throw error;
    }
  });
}

// For a person who has a device but signed in without a code (possible only while 2-step login is off):
// a good code from any of their devices unlocks adding and removing devices.
export async function unlockDevicesAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withPanel({ action: "security.self", formData }, async () => {
    const api = await createMfaApi();
    for (const device of verifiedOf(await api.list())) {
      if (await api.verify(device.id, text(formData, "code"))) {
        revalidatePath("/admin/security");
        return { ok: true, message: "Unlocked." };
      }
    }
    return { ok: false, code: "invalid", message: "That code is not right." };
  });
}
