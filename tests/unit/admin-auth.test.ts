import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PanelAuthError,
  FRESH_2FA_SECONDS,
  checkPanel,
  devBypassSession,
  isFresh2faValid,
  makeFresh2faValue,
  type PanelSession,
} from "@/server/auth/panel-core";
import { profiles } from "@/server/db/schema";

import { createTestDb } from "../helpers/test-db";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
// A client (role user). Must be refused by the admin area.
const MISMATCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ADMIN = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const MUST_SET_UP = "12121212-1212-4212-8212-121212121212";
const SIGNED_OUT = "34343434-3434-4434-8434-343434343434";
const REVOKED_AT = new Date("2026-01-01T12:00:00Z");
const session = (userId: string, aal: PanelSession["aal"] = "aal2"): PanelSession => ({
  userId,
  email: "zolb-test+a@example.com",
  aal,
});

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(profiles).values([
    { id: OWNER, fullName: "Owner", email: "zolb-test+o@example.com", role: "owner" },
    { id: STAFF, fullName: "Staff", email: "zolb-test+s@example.com", role: "staff" },
    { id: ADMIN, fullName: "Admin", email: "zolb-test+ad@example.com", role: "admin" },
    {
      id: OFF,
      fullName: "Off",
      email: "zolb-test+x@example.com",
      role: "staff",
      isActive: false,
    },
    { id: MISMATCH, fullName: "Client", email: "zolb-test+m@example.com", role: "user" },
    {
      id: MUST_SET_UP,
      fullName: "Reset",
      email: "zolb-test+r@example.com",
      role: "staff",
      mfaResetRequired: true,
    },
    {
      id: SIGNED_OUT,
      fullName: "Signed out",
      email: "zolb-test+so@example.com",
      role: "staff",
      sessionsRevokedAt: REVOKED_AT,
    },
  ]);
}, 60_000);
afterAll(async () => t.close());

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e) => (e as PanelAuthError).code,
  );

describe("checkPanel", () => {
  it("lets an active owner and an active staff member in with 2FA", async () => {
    expect((await checkPanel(t.db, session(OWNER))).role).toBe("owner");
    expect((await checkPanel(t.db, session(STAFF))).role).toBe("staff");
  });
  it("refuses a logged-out visitor", async () => {
    expect(await code(checkPanel(t.db, null))).toBe("no-session");
  });
  it("refuses a session that has only a password (no 2FA code)", async () => {
    expect(await code(checkPanel(t.db, session(OWNER, "aal1")))).toBe("needs-2fa");
  });
  it("refuses a login that is not an admin", async () => {
    expect(await code(checkPanel(t.db, session("dddddddd-dddd-4ddd-8ddd-dddddddddddd")))).toBe(
      "not-admin",
    );
  });
  it("refuses a turned-off admin at once", async () => {
    expect(await code(checkPanel(t.db, session(OFF)))).toBe("inactive");
  });
  it("refuses a client account (role user)", async () => {
    expect(await code(checkPanel(t.db, session(MISMATCH)))).toBe("not-admin");
  });
  it("keeps staff out of admin actions (payment methods, accounts, export, dashboard)", async () => {
    for (const action of [
      "payment_methods.manage",
      "accounts.view",
      "export.csv",
      "dashboard.view",
      "payments.verify",
    ] as const) {
      expect(await code(checkPanel(t.db, session(STAFF), { action }))).toBe("wrong-role");
      expect(await code(checkPanel(t.db, session(OWNER), { action }))).toBe("ok");
      expect(await code(checkPanel(t.db, session(ADMIN), { action }))).toBe("ok");
    }
    expect(await code(checkPanel(t.db, session(STAFF), { action: "requests.view" }))).toBe("ok");
  });
  it("lets only an owner manage owner accounts", async () => {
    const action = "accounts.manage_owner" as const;
    expect(await code(checkPanel(t.db, session(OWNER), { action }))).toBe("ok");
    expect(await code(checkPanel(t.db, session(ADMIN), { action }))).toBe("wrong-role");
  });
  it("sends an account with a pending 2-step reset to the setup (needs-mfa-setup)", async () => {
    expect(await code(checkPanel(t.db, session(MUST_SET_UP)))).toBe("needs-mfa-setup");
    // The setup pages themselves call it with twoFactorRequired false, so they stay reachable.
    expect(
      await code(checkPanel(t.db, session(MUST_SET_UP, "aal1"), { twoFactorRequired: false })),
    ).toBe("ok");
  });
  it("signs out everywhere: a session older than the mark is refused, a newer one is fine", async () => {
    const old = { ...session(SIGNED_OUT), startedAt: REVOKED_AT.getTime() - 1000 };
    const fresh = { ...session(SIGNED_OUT), startedAt: REVOKED_AT.getTime() + 1000 };
    expect(await code(checkPanel(t.db, old))).toBe("session-revoked");
    expect(await code(checkPanel(t.db, fresh))).toBe("ok");
    // Start time unknown and not found by the lookup = refused (fails closed).
    expect(await code(checkPanel(t.db, session(SIGNED_OUT)))).toBe("session-revoked");
    const lookup = async () => REVOKED_AT.getTime() + 5000;
    expect(
      await code(
        checkPanel(
          t.db,
          { ...session(SIGNED_OUT), sessionId: "s1" },
          { lookupSessionStart: lookup },
        ),
      ),
    ).toBe("ok");
  });
});

describe("checkPanel with the 2FA flag OFF (twoFactorRequired: false)", () => {
  const off = { twoFactorRequired: false };
  it("lets an admin in with a password-only session", async () => {
    expect((await checkPanel(t.db, session(OWNER, "aal1"), off)).role).toBe("owner");
  });
  it("still refuses a logged-out visitor", async () => {
    expect(await code(checkPanel(t.db, null, off))).toBe("no-session");
  });
  it("still refuses a login that is not an admin", async () => {
    const stranger = session("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "aal1");
    expect(await code(checkPanel(t.db, stranger, off))).toBe("not-admin");
  });
  it("still refuses a turned-off admin", async () => {
    expect(await code(checkPanel(t.db, session(OFF, "aal1"), off))).toBe("inactive");
  });
  it("still refuses an account with the role user", async () => {
    expect(await code(checkPanel(t.db, session(MISMATCH, "aal1"), off))).toBe("not-admin");
  });
  it("still keeps staff out of admin actions", async () => {
    const result = await code(
      checkPanel(t.db, session(STAFF, "aal1"), { ...off, action: "payment_methods.manage" }),
    );
    expect(result).toBe("wrong-role");
  });
  it("still refuses a turned-off account and a signed-out-everywhere session", async () => {
    expect(await code(checkPanel(t.db, session(SIGNED_OUT, "aal1"), off))).toBe("session-revoked");
  });
  it("still needs 2FA when the option is true or not given", async () => {
    expect(await code(checkPanel(t.db, session(OWNER, "aal1"), { twoFactorRequired: true }))).toBe(
      "needs-2fa",
    );
    expect(await code(checkPanel(t.db, session(OWNER, "aal1"), {}))).toBe("needs-2fa");
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
    const { isTwoFactorRequired } = await import("@/server/auth/panel-core");
    expect(isTwoFactorRequired(undefined)).toBe(true);
    expect(isTwoFactorRequired("")).toBe(true);
    expect(isTwoFactorRequired("true")).toBe(true);
    expect(isTwoFactorRequired("0")).toBe(true);
    expect(isTwoFactorRequired("false")).toBe(false);
    expect(isTwoFactorRequired(" FALSE ")).toBe(false);
  });
});

describe("recordDenied", () => {
  it("writes who tried what and where to the activity log (a staff member typing a hidden address)", async () => {
    const { recordDenied } = await import("@/server/auth/panel-core");
    const { activityLog } = await import("@/server/db/schema");
    await recordDenied(t.db, {
      actorId: STAFF,
      action: "payment_methods.manage",
      where: "/admin/settings/payments",
      ipHash: "hash",
    });
    const rows = await t.db.select().from(activityLog);
    const row = rows.find((r) => r.action === "access.denied")!;
    expect(row).toMatchObject({
      actorType: "admin",
      actorId: STAFF,
      entityType: "page",
      entityId: "/admin/settings/payments",
      details: { action: "payment_methods.manage" },
    });
  });
});
