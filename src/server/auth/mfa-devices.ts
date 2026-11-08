import "server-only";

// The authenticator devices of ONE signed-in person. No cookies and no Supabase here, so it is easy to test.
// Supabase allows several authenticator apps ("factors") per person. We use that for a backup device:
//   - the first setup needs two devices (an app and a backup)
//   - a device is removed only with a code from ANOTHER device
//   - the last device can never be removed
// docs/AUTH_AND_ROLES.md section 8 and docs/RECOVERY.md.

export type MfaFactor = {
  id: string;
  name: string;
  createdAt: string;
  verified: boolean;
};

// What we need from Supabase for the signed-in person. A fake is used in tests.
export interface MfaApi {
  list(): Promise<MfaFactor[]>;
  enroll(name: string): Promise<{ id: string; qr: string; secret: string }>;
  // Checks a 6-digit code against one device. This also lifts the session to the higher level.
  verify(factorId: string, code: string): Promise<boolean>;
  // Removes a device. Supabase needs the higher level for a verified device.
  unenroll(factorId: string): Promise<void>;
}

export class DeviceError extends Error {
  constructor(
    public code: "last-device" | "same-device" | "invalid" | "not-found",
    message: string,
  ) {
    super(message);
  }
}

export const DEVICES_NEEDED = 2;

export const verifiedOf = (factors: MfaFactor[]) => factors.filter((f) => f.verified);

// A short name people can tell apart ("Rosemarie's phone"). Never empty.
export function cleanDeviceName(value: string, fallback: string): string {
  const name = value.replace(/\s+/g, " ").trim().slice(0, 40);
  return name || fallback;
}

// Starts adding a device. A device that was started but never finished is removed first, so names do not clash
// and no half-finished device stays behind.
export async function startEnrollment(api: MfaApi, name: string) {
  const factors = await api.list();
  for (const old of factors.filter((f) => !f.verified)) await api.unenroll(old.id);
  const taken = new Set(factors.filter((f) => f.verified).map((f) => f.name));
  let finalName = name;
  for (let n = 2; taken.has(finalName); n++) finalName = `${name} (${n})`;
  return api.enroll(finalName);
}

// Finishes adding a device with its first code. Returns how many verified devices there are now.
export async function finishEnrollment(
  api: MfaApi,
  input: { factorId: string; code: string },
): Promise<number> {
  const ok = await api.verify(input.factorId, input.code);
  if (!ok) throw new DeviceError("invalid", "That code is not right. Please try the newest code.");
  return verifiedOf(await api.list()).length;
}

// Removes one device. The code must come from a DIFFERENT verified device, so a stolen open browser or a
// stolen phone alone cannot take the others away. The last device is never removed.
export async function removeDevice(
  api: MfaApi,
  input: { factorId: string; code: string },
): Promise<{ name: string }> {
  const factors = await api.list();
  const target = factors.find((f) => f.id === input.factorId);
  if (!target) throw new DeviceError("not-found", "That device was not found.");

  if (target.verified) {
    const verified = verifiedOf(factors);
    if (verified.length <= 1)
      throw new DeviceError("last-device", "You cannot remove your last device.");
    const others = verified.filter((f) => f.id !== target.id);
    let accepted = false;
    for (const other of others) {
      if (await api.verify(other.id, input.code)) {
        accepted = true;
        break;
      }
    }
    if (!accepted)
      throw new DeviceError(
        "same-device",
        "Enter a code from a DIFFERENT device than the one you are removing.",
      );
  }
  await api.unenroll(target.id);
  return { name: target.name };
}
