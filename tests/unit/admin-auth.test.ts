import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AdminAuthError,
  FRESH_2FA_SECONDS,
  OWNER_ONLY,
  checkAdmin,
  devBypassSession,
  isFresh2faValid,
  makeFresh2faValue,
  type AdminSession,
} from "@/server/auth/admin-core";
import { adminProfiles } from "@/server/db/schema";

import { createTestDb } from "../helpers/test-db";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const session = (userId: string, aal: AdminSession["aal"] = "aal2"): AdminSession => ({
  userId,
  email: "zolb-test+a@example.com",
  aal,
});

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(adminProfiles).values([
    { id: OWNER, fullName: "Owner", email: "zolb-test+o@example.com", role: "owner" },
    { id: STAFF, fullName: "Staff", email: "zolb-test+s@example.com", role: "staff" },
    { id: OFF, fullName: "Off", email: "zolb-test+x@example.com", role: "staff", isActive: false },
  ]);
}, 60_000);
afterAll(async () => t.close());

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e) => (e as AdminAuthError).code,
  );

describe("checkAdmin", () => {
  it("lets an active owner and an active staff member in with 2FA", async () => {
    expect((await checkAdmin(t.db, session(OWNER))).role).toBe("owner");
    expect((await checkAdmin(t.db, session(STAFF))).role).toBe("staff");
  });
  it("refuses a logged-out visitor", async () => {
    expect(await code(checkAdmin(t.db, null))).toBe("no-session");
  });
  it("refuses a session that has only a password (no 2FA code)", async () => {
    expect(await code(checkAdmin(t.db, session(OWNER, "aal1")))).toBe("needs-2fa");
  });
  it("refuses a login that is not an admin", async () => {
    expect(await code(checkAdmin(t.db, session("dddddddd-dddd-4ddd-8ddd-dddddddddddd")))).toBe(
      "not-admin",
    );
  });
  it("refuses a turned-off admin at once", async () => {
    expect(await code(checkAdmin(t.db, session(OFF)))).toBe("inactive");
  });
  it("keeps staff out of owner-only actions (payment methods, users, export)", async () => {
    expect(await code(checkAdmin(t.db, session(STAFF), { roles: OWNER_ONLY }))).toBe("wrong-role");
    expect(await code(checkAdmin(t.db, session(OWNER), { roles: OWNER_ONLY }))).toBe("ok");
  });
});

describe("checkAdmin with the 2FA flag OFF (twoFactorRequired: false)", () => {
  const off = { twoFactorRequired: false };
  it("lets an admin in with a password-only session", async () => {
    expect((await checkAdmin(t.db, session(OWNER, "aal1"), off)).role).toBe("owner");
  });
  it("still refuses a logged-out visitor", async () => {
    expect(await code(checkAdmin(t.db, null, off))).toBe("no-session");
  });
  it("still refuses a login that is not an admin", async () => {
    const stranger = session("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "aal1");
    expect(await code(checkAdmin(t.db, stranger, off))).toBe("not-admin");
  });
  it("still refuses a turned-off admin", async () => {
    expect(await code(checkAdmin(t.db, session(OFF, "aal1"), off))).toBe("inactive");
  });
  it("still keeps staff out of owner-only actions", async () => {
    const result = await code(
      checkAdmin(t.db, session(STAFF, "aal1"), { ...off, roles: OWNER_ONLY }),
    );
    expect(result).toBe("wrong-role");
  });
  it("still needs 2FA when the option is true or not given", async () => {
    expect(await code(checkAdmin(t.db, session(OWNER, "aal1"), { twoFactorRequired: true }))).toBe(
      "needs-2fa",
    );
    expect(await code(checkAdmin(t.db, session(OWNER, "aal1"), {}))).toBe("needs-2fa");
  });
});

describe("development bypass", () => {
  it("works only in development, and only with an email", () => {
    expect(
      devBypassSession({ nodeEnv: "development", email: "zolb-test+o@example.com" }),
    ).toMatchObject({ aal: "aal2" });
    expect(
      devBypassSession({ nodeEnv: "production", email: "zolb-test+o@example.com" }),
    ).toBeNull();
    expect(devBypassSession({ nodeEnv: "test", email: "zolb-test+o@example.com" })).toBeNull();
    expect(devBypassSession({ nodeEnv: undefined, email: "zolb-test+o@example.com" })).toBeNull();
    expect(devBypassSession({ nodeEnv: "development", email: "  " })).toBeNull();
    expect(devBypassSession({ nodeEnv: "development" })).toBeNull();
  });
});

describe("fresh 2FA cookie", () => {
  const now = 1_800_000_000_000;
  it("is valid for 5 minutes for the same admin", () => {
    const value = makeFresh2faValue("s", OWNER, now);
    expect(isFresh2faValid("s", OWNER, value, now + 1000)).toBe(true);
    expect(isFresh2faValid("s", OWNER, value, now + FRESH_2FA_SECONDS * 1000 - 1)).toBe(true);
    expect(isFresh2faValid("s", OWNER, value, now + FRESH_2FA_SECONDS * 1000 + 1)).toBe(false);
  });
  it("is refused for another admin, a forged value, another secret, or no cookie", () => {
    const value = makeFresh2faValue("s", OWNER, now);
    expect(isFresh2faValid("s", STAFF, value, now)).toBe(false);
    expect(isFresh2faValid("other", OWNER, value, now)).toBe(false);
    expect(isFresh2faValid("s", OWNER, value.replace(/.$/, "0"), now)).toBe(false);
    expect(isFresh2faValid("s", OWNER, `${OWNER}.${now + 9e9}.abc`, now)).toBe(false);
    expect(isFresh2faValid("s", OWNER, undefined, now)).toBe(false);
    expect(isFresh2faValid("s", OWNER, "garbage", now)).toBe(false);
  });
});

describe("isTwoFactorRequired", () => {
  it("is required unless the setting is the word false", async () => {
    const { isTwoFactorRequired } = await import("@/server/auth/admin-core");
    expect(isTwoFactorRequired(undefined)).toBe(true);
    expect(isTwoFactorRequired("")).toBe(true);
    expect(isTwoFactorRequired("true")).toBe(true);
    expect(isTwoFactorRequired("0")).toBe(true);
    expect(isTwoFactorRequired("false")).toBe(false);
    expect(isTwoFactorRequired(" FALSE ")).toBe(false);
  });
});
