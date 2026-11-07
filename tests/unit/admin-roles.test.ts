// Making an existing account an admin, and removing the admin role. Owner only, fresh 2FA, logged.
// Test accounts use zolb-test+...@example.com only.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminAuthError, checkAdmin, type AdminProfile } from "@/server/auth/admin-core";
import { activityLog, adminProfiles, profiles } from "@/server/db/schema";
import {
  promoteToAdmin,
  removeAdmin,
  updateAdmin,
  UserAdminError,
} from "@/server/services/admin-users";

import { createTestDb } from "../helpers/test-db";

const OWNER = "a0000000-0000-4000-8000-0000000000a1";
const OWNER2 = "a0000000-0000-4000-8000-0000000000a2";
const STAFF = "b0000000-0000-4000-8000-0000000000b1";
const USER1 = "c0000000-0000-4000-8000-0000000000c1";
const USER2 = "c0000000-0000-4000-8000-0000000000c2";

let t: Awaited<ReturnType<typeof createTestDb>>;
let owner: AdminProfile;
let staff: AdminProfile;

const fresh = { fresh2fa: true, ipHash: "iphash" };
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? String(e),
  );

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(adminProfiles).values([
    { id: OWNER, fullName: "Owner", email: "zolb-test+o1@example.com", role: "owner" },
    { id: OWNER2, fullName: "Owner Two", email: "zolb-test+o2@example.com", role: "owner" },
    { id: STAFF, fullName: "Staff", email: "zolb-test+s@example.com", role: "staff" },
  ]);
  await t.db.insert(profiles).values([
    { id: OWNER, email: "zolb-test+o1@example.com", role: "admin" },
    { id: OWNER2, email: "zolb-test+o2@example.com", role: "admin" },
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

describe("promoteToAdmin", () => {
  it("is for owners only, and needs a fresh code", async () => {
    const input = { email: "zolb-test+u1@example.com", role: "staff" as const };
    expect(await code(promoteToAdmin(t.db, staff, input, fresh))).toBe("wrong-role");
    expect(await code(promoteToAdmin(t.db, owner, input, { fresh2fa: false }))).toBe(
      "needs-fresh-2fa",
    );
    expect(await roleOf(USER1)).toBe("user");
  });

  it("refuses an email that has no account", async () => {
    expect(
      await code(
        promoteToAdmin(
          t.db,
          owner,
          { email: "zolb-test+nobody@example.com", role: "staff" },
          fresh,
        ),
      ),
    ).toBe("not-found");
    expect(
      await code(promoteToAdmin(t.db, owner, { email: "not an email", role: "staff" }, fresh)),
    ).toBe("invalid");
  });

  it("makes the account an admin in BOTH places, and logs the change", async () => {
    await promoteToAdmin(
      t.db,
      owner,
      { email: " ZOLB-test+U1@example.com ", role: "staff" },
      fresh,
    );
    expect(await roleOf(USER1)).toBe("admin");
    const [row] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, USER1));
    expect(row).toMatchObject({ role: "staff", isActive: true, fullName: "User One" });

    const log = await t.db.select().from(activityLog).where(eq(activityLog.action, "role.changed"));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorId: OWNER, entityId: USER1 });
    expect(log[0].details).toEqual({ from: "user", to: "admin", level: "staff" });
    // No email in the log.
    expect(JSON.stringify(log[0])).not.toContain("zolb-test+u1");

    // The new admin passes the admin check (with 2FA off for this test).
    const result = await checkAdmin(
      t.db,
      { userId: USER1, email: "zolb-test+u1@example.com", aal: "aal1" },
      { twoFactorRequired: false },
    );
    expect(result.role).toBe("staff");
  });

  it("refuses someone who is already an admin", async () => {
    expect(
      await code(
        promoteToAdmin(t.db, owner, { email: "zolb-test+u1@example.com", role: "owner" }, fresh),
      ),
    ).toBe("exists");
  });
});

describe("removeAdmin", () => {
  it("is for owners only, and needs a fresh code", async () => {
    expect(await code(removeAdmin(t.db, staff, { adminId: USER1 }, fresh))).toBe("wrong-role");
    expect(await code(removeAdmin(t.db, owner, { adminId: USER1 }, { fresh2fa: false }))).toBe(
      "needs-fresh-2fa",
    );
    expect(await roleOf(USER1)).toBe("admin");
  });

  it("refuses to remove yourself", async () => {
    expect(await code(removeAdmin(t.db, owner, { adminId: OWNER }, fresh))).toBe("self");
  });

  it("refuses an id that is not an admin", async () => {
    expect(await code(removeAdmin(t.db, owner, { adminId: USER2 }, fresh))).toBe("not-found");
  });

  it("turns the admin back into a normal user, and they can no longer pass the admin check", async () => {
    await removeAdmin(t.db, owner, { adminId: USER1 }, fresh);
    expect(await roleOf(USER1)).toBe("user");
    const [row] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, USER1));
    expect(row.isActive).toBe(false);
    await expect(
      checkAdmin(
        t.db,
        { userId: USER1, email: "zolb-test+u1@example.com", aal: "aal2" },
        { twoFactorRequired: false },
      ),
    ).rejects.toBeInstanceOf(AdminAuthError);

    const log = await t.db.select().from(activityLog).where(eq(activityLog.action, "role.changed"));
    expect(log.map((l) => l.details)).toContainEqual({ from: "admin", to: "user", level: "staff" });
  });

  it("can make the same person an admin again", async () => {
    await promoteToAdmin(t.db, owner, { email: "zolb-test+u1@example.com", role: "staff" }, fresh);
    expect(await roleOf(USER1)).toBe("admin");
    const [row] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, USER1));
    expect(row.isActive).toBe(true);
  });

  it("turning an admin back ON also gives back the admin account role", async () => {
    await removeAdmin(t.db, owner, { adminId: USER1 }, fresh);
    await updateAdmin(t.db, owner, { adminId: USER1, isActive: true }, fresh);
    expect(await roleOf(USER1)).toBe("admin");
  });

  it("never removes the last active owner, and changes nothing when it refuses", async () => {
    // OWNER2 acts, OWNER is removed first (two owners), then the last owner cannot be removed.
    const [owner2] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, OWNER2));
    await removeAdmin(t.db, owner2, { adminId: OWNER }, fresh);
    const err = await removeAdmin(
      t.db,
      { ...owner, id: OWNER } as AdminProfile,
      { adminId: OWNER2 },
      fresh,
    ).catch((e) => e);
    // OWNER is not an active owner any more, so the last-owner rule fires for OWNER2.
    expect(err).toBeInstanceOf(UserAdminError);
    expect(err.code).toBe("last-owner");
    expect(await roleOf(OWNER2)).toBe("admin");
    const [still] = await t.db.select().from(adminProfiles).where(eq(adminProfiles.id, OWNER2));
    expect(still.isActive).toBe(true);
  });
});
