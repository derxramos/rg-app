import { beforeEach, describe, expect, it } from "vitest";

import {
  DeviceError,
  cleanDeviceName,
  finishEnrollment,
  removeDevice,
  startEnrollment,
  verifiedOf,
  type MfaApi,
  type MfaFactor,
} from "@/server/auth/mfa-devices";

// A fake of the signed-in person's devices. Each device has its own secret code.
function fakeApi(initial: (MfaFactor & { code: string })[]) {
  const devices = [...initial];
  const calls: string[] = [];
  const api: MfaApi = {
    list: async () =>
      devices.map((device) => ({
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        verified: device.verified,
      })),
    enroll: async (name) => {
      calls.push(`enroll:${name}`);
      const id = `new-${devices.length + 1}`;
      devices.push({ id, name, createdAt: "2026-11-08", verified: false, code: "111111" });
      return { id, qr: "data:qr", secret: "SECRET" };
    },
    verify: async (factorId, code) => {
      calls.push(`verify:${factorId}`);
      const device = devices.find((d) => d.id === factorId);
      if (device && device.code === code) {
        device.verified = true;
        return true;
      }
      return false;
    },
    unenroll: async (factorId) => {
      calls.push(`unenroll:${factorId}`);
      devices.splice(
        devices.findIndex((d) => d.id === factorId),
        1,
      );
    },
  };
  return { api, devices, calls };
}

const phone = { id: "A", name: "Phone", createdAt: "2026-01-01", verified: true, code: "111111" };
const backup = { id: "B", name: "Backup", createdAt: "2026-01-02", verified: true, code: "222222" };

describe("cleanDeviceName", () => {
  it("trims, shortens and never returns an empty name", () => {
    expect(cleanDeviceName("  Rosemarie's   phone ", "Device")).toBe("Rosemarie's phone");
    expect(cleanDeviceName("   ", "My device")).toBe("My device");
    expect(cleanDeviceName("x".repeat(100), "d")).toHaveLength(40);
  });
});

describe("adding a device", () => {
  it("removes a half-finished device first, and gives a free name", async () => {
    const { api, calls } = fakeApi([
      phone,
      { id: "half", name: "Backup", createdAt: "x", verified: false, code: "999999" },
    ]);
    await startEnrollment(api, "Phone");
    expect(calls).toEqual(["unenroll:half", "enroll:Phone (2)"]);
  });
  it("counts the verified devices after a good first code", async () => {
    const { api } = fakeApi([phone]);
    const started = await startEnrollment(api, "Backup");
    expect(await finishEnrollment(api, { factorId: started.id, code: "111111" })).toBe(2);
  });
  it("refuses a wrong first code", async () => {
    const { api } = fakeApi([phone]);
    const started = await startEnrollment(api, "Backup");
    await expect(finishEnrollment(api, { factorId: started.id, code: "000000" })).rejects.toThrow(
      DeviceError,
    );
  });
});

describe("removing a device", () => {
  let fake: ReturnType<typeof fakeApi>;
  beforeEach(() => {
    fake = fakeApi([phone, backup]);
  });

  it("works with a code from the OTHER device", async () => {
    const result = await removeDevice(fake.api, { factorId: "A", code: "222222" });
    expect(result.name).toBe("Phone");
    expect(verifiedOf(await fake.api.list()).map((f) => f.id)).toEqual(["B"]);
  });

  it("refuses a code from the same device that is being removed", async () => {
    await expect(removeDevice(fake.api, { factorId: "A", code: "111111" })).rejects.toMatchObject({
      code: "same-device",
    });
    expect(fake.calls).not.toContain("unenroll:A");
    expect(verifiedOf(await fake.api.list())).toHaveLength(2);
  });

  it("refuses a wrong code", async () => {
    await expect(removeDevice(fake.api, { factorId: "A", code: "000000" })).rejects.toMatchObject({
      code: "same-device",
    });
  });

  it("never removes the last device, whatever code is given", async () => {
    await removeDevice(fake.api, { factorId: "A", code: "222222" });
    for (const code of ["222222", "111111", "000000"]) {
      await expect(removeDevice(fake.api, { factorId: "B", code })).rejects.toMatchObject({
        code: "last-device",
      });
    }
    expect(verifiedOf(await fake.api.list())).toHaveLength(1);
  });

  it("knows a device that does not exist", async () => {
    await expect(
      removeDevice(fake.api, { factorId: "nope", code: "222222" }),
    ).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("removes a half-finished device without a code", async () => {
    const f = fakeApi([
      phone,
      { id: "half", name: "x", createdAt: "x", verified: false, code: "9" },
    ]);
    await removeDevice(f.api, { factorId: "half", code: "" });
    expect(f.calls).toEqual(["unenroll:half"]);
  });

  it("with three devices, a code from either of the other two is enough", async () => {
    const third = { id: "C", name: "Tablet", createdAt: "x", verified: true, code: "333333" };
    const f = fakeApi([phone, backup, third]);
    await removeDevice(f.api, { factorId: "A", code: "333333" });
    expect(verifiedOf(await f.api.list()).map((d) => d.id)).toEqual(["B", "C"]);
  });
});
