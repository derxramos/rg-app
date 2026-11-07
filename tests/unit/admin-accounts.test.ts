// "Existing accounts" (User / Admin dropdown) and "New admin account" (temporary password).
// Owner only, fresh 2FA, logged. Test accounts use zolb-test+...@example.com only.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminAuthError, checkAdmin, type AdminProfile } from "@/server/auth/admin-core";
import { activityLog, adminProfiles, profiles } from "@/server/db/schema";
import {
  createAdminWithPassword,
  listAccounts,
  setAccountRole,
  type AuthPasswordApi,
} from "@/server/services/admin-users";

import { createTestDb } from "../helpers/test-db";

const OWNER = "a0000000-0000-4000-8000-0000000000a1";
const STAFF = "b0000000-0000-4000-8000-0000000000b1";
const USER1 = "c0000000-0000-4000-8000-0000000000c1";
const USER2 = "c0000000-0000-4000-8000-0000000000c2";
const NEW_ID = "d0000000-0000-4000-8000-0000000000d1";

let t: Awaited<ReturnType<typeof createTestDb>>;
let owner: AdminProfile;
let staff: AdminProfile;

const fresh = { fresh2fa: true, ipHash: "iphash" };
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? String(e),
  );

function fakeApi(id = NEW_ID) {
  const calls = { created: [] as string[], removed: [] as string[] };
  const api: AuthPasswordApi = {
    async createWithPassword(input) {
      calls.created.push(input.email);
      return { id };
    },
    async remove(userId) {
      calls.removed.push(userId);
    },
  };
  return { api, calls };
}

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(adminProfiles).values([
    { id: OWNER, fullName: "Owner", email: "zolb-test+o1@example.com", role: "owner" },
    { id: STAFF, fullName: "Staff", email: "zolb-test+s@example.com", role: "staff" },
  ]);
  await t.db.insert(profiles).values([
    { id: OWNER, email: "zolb-test+o1@example.com", role: "admin" },
    { id: STAFF, email: "zolb-test+s@example.com", role: "admin" },
    { id: USER1, email: "zolb-test+u1@example.com", fullName: "User One" },
    { id: USER2, email: "zolb-test+u2@example.com", fullName: "User Two" },
  ]);
  [owner] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, OWNER));
  [staff] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, STAFF));
}, 60_000);
afterAll(async () => t.close());

const roleOf = async (id: string) =>
  (await t.db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, id)))[0]?.role;

describe("listAccounts", () => {
  it("lists users and admins with their level", async () => {
    const rows = await listAccounts(t.db);
    expect(rows.map((r) => r.email)).toEqual([
      "zolb-test+o1@example.com",
      "zolb-test+s@example.com",
      "zolb-test+u1@example.com",
      "zolb-test+u2@example.com",
    ]);
    expect(rows.find((r) => r.id === OWNER)).toMatchObject({ role: "admin", level: "owner" });
    expect(rows.find((r) => r.id === USER1)).toMatchObject({ role: "user", level: null });
  });

  it("searches by part of the email or the name, and treats % and _ as plain text", async () => {
    expect((await listAccounts(t.db, "u2")).map((r) => r.id)).toEqual([USER2]);
    expect((await listAccounts(t.db, "user one")).map((r) => r.id)).toEqual([USER1]);
    expect(await listAccounts(t.db, "%")).toEqual([]);
    expect(await listAccounts(t.db, "_")).toEqual([]);
  });
});

describe("setAccountRole (the User / Admin dropdown)", () => {
  it("is for owners only, and needs a fresh code", async () => {
    const input = { accountId: USER1, role: "admin" as const };
    expect(await code(setAccountRole(t.db, staff, input, fresh))).toBe("wrong-role");
    expect(await code(setAccountRole(t.db, owner, input, { fresh2fa: false }))).toBe(
      "needs-fresh-2fa",
    );
    expect(await roleOf(USER1)).toBe("user");
  });

  it("changes nothing when the role is the same", async () => {
    expect(await setAccountRole(t.db, owner, { accountId: USER1, role: "user" }, fresh)).toBe(
      "same",
    );
  });

  it("refuses your own account and an unknown account", async () => {
    expect(await code(setAccountRole(t.db, owner, { accountId: OWNER, role: "user" }, fresh))).toBe(
      "self",
    );
    expect(
      await code(
        setAccountRole(
          t.db,
          owner,
          { accountId: "e0000000-0000-4000-8000-0000000000e1", role: "admin" },
          fresh,
        ),
      ),
    ).toBe("not-found");
  });

  it("makes a user a staff admin, then a user again, and logs both", async () => {
    expect(await setAccountRole(t.db, owner, { accountId: USER1, role: "admin" }, fresh)).toBe(
      "changed",
    );
    expect(await roleOf(USER1)).toBe("admin");
    const [admin] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, USER1));
    expect(admin).toMatchObject({ role: "staff", isActive: true });

    await setAccountRole(t.db, owner, { accountId: USER1, role: "user" }, fresh);
    expect(await roleOf(USER1)).toBe("user");
    const log = await t.db.select().from(activityLog).where(eq(activityLog.action, "role.changed"));
    expect(log).toHaveLength(2);
  });

  it("gives an old owner back the owner level", async () => {
    await t.db.update(adminProfiles).set({ role: "owner" }).where(eq(adminProfiles.id, USER1));
    await setAccountRole(t.db, owner, { accountId: USER1, role: "admin" }, fresh);
    const [admin] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, USER1));
    expect(admin.role).toBe("owner");
    // Back to normal for the next tests.
    await setAccountRole(t.db, owner, { accountId: USER1, role: "user" }, fresh);
  });
});

describe("createAdminWithPassword (New admin account)", () => {
  const input = {
    email: "ZOLB-test+new1@example.com ",
    fullName: "New Admin",
    role: "staff" as const,
    temporaryPassword: "Blue River Morning 42",
  };

  it("is for owners only, and needs a fresh code", async () => {
    const { api, calls } = fakeApi();
    expect(await code(createAdminWithPassword(t.db, staff, api, input, fresh))).toBe("wrong-role");
    expect(await code(createAdminWithPassword(t.db, owner, api, input, { fresh2fa: false }))).toBe(
      "needs-fresh-2fa",
    );
    expect(calls.created).toEqual([]);
  });

  it("refuses bad values before it makes any login", async () => {
    const { api, calls } = fakeApi();
    for (const bad of [
      { ...input, email: "not an email" },
      { ...input, fullName: "A" },
      { ...input, temporaryPassword: "short" },
      { ...input, temporaryPassword: "Pass-Word-123" },
      { ...input, temporaryPassword: "zolb-test+new1@example.com" },
      { ...input, role: "boss" as unknown as "owner" },
    ]) {
      expect(await code(createAdminWithPassword(t.db, owner, api, bad, fresh))).toBe("invalid");
    }
    expect(calls.created).toEqual([]);
  });

  it("refuses an email that already has an account", async () => {
    const { api, calls } = fakeApi();
    expect(
      await code(
        createAdminWithPassword(
          t.db,
          owner,
          api,
          { ...input, email: "zolb-test+u2@example.com" },
          fresh,
        ),
      ),
    ).toBe("exists");
    expect(calls.created).toEqual([]);
  });

  it("makes an admin who must change the password, and never logs the password", async () => {
    const { api, calls } = fakeApi();
    await createAdminWithPassword(t.db, owner, api, input, fresh);
    expect(calls.created).toEqual(["zolb-test+new1@example.com"]);

    expect(await roleOf(NEW_ID)).toBe("admin");
    const [account] = await t.db.select().from(profiles).where(eq(profiles.id, NEW_ID));
    expect(account).toMatchObject({ mustChangePassword: true, fullName: "New Admin" });
    const [admin] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, NEW_ID));
    expect(admin).toMatchObject({ role: "staff", isActive: true });

    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "admin.created"));
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log[0])).not.toContain("Blue River");
    expect(JSON.stringify(log[0])).not.toContain("zolb-test+new1");
  });

  it("keeps the new admin out of the admin area until the password is changed", async () => {
    const session = { userId: NEW_ID, email: "zolb-test+new1@example.com", aal: "aal2" as const };
    const err = await checkAdmin(t.db, session).catch((e) => e);
    expect(err).toBeInstanceOf(AdminAuthError);
    expect(err.code).toBe("must-change-password");

    await t.db.update(profiles).set({ mustChangePassword: false }).where(eq(profiles.id, NEW_ID));
    const ok = await checkAdmin(t.db, session);
    expect(ok.id).toBe(NEW_ID);
  });

  it("removes the new login again when saving the admin record fails", async () => {
    // The id of an existing admin makes the insert fail.
    const { api, calls } = fakeApi(STAFF);
    const result = await code(
      createAdminWithPassword(
        t.db,
        owner,
        api,
        { ...input, email: "zolb-test+new2@example.com" },
        fresh,
      ),
    );
    expect(result).not.toBe("ok");
    expect(calls.removed).toEqual([STAFF]);
  });
});
