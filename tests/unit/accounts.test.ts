// The accounts service (Settings > Admin users): invite, create with a temporary password, change role,
// turn off / on, resend, and the server-side table. Uses the fake Supabase (auth.users, mfa_factors).
// Test data uses zolb-test+...@example.com emails only.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PanelUser } from "@/server/auth/panel-core";
import { activityLog, profiles } from "@/server/db/schema";
import {
  changeRole,
  createAccountWithPassword,
  inviteAccount,
  listAccounts,
  resendInvite,
  setAccountActive,
  type AuthAdminApi,
  type AuthPasswordApi,
} from "@/server/services/accounts";

import { createTestDb } from "../helpers/test-db";

const ids = {
  owner: "a0000000-0000-4000-8000-0000000000a1",
  owner2: "a0000000-0000-4000-8000-0000000000a2",
  admin: "b0000000-0000-4000-8000-0000000000b1",
  admin2: "b0000000-0000-4000-8000-0000000000b2",
  staff: "c0000000-0000-4000-8000-0000000000c1",
  staff2: "c0000000-0000-4000-8000-0000000000c2",
  client: "d0000000-0000-4000-8000-0000000000d1",
  unverified: "e0000000-0000-4000-8000-0000000000e1",
  temp: "e0000000-0000-4000-8000-0000000000e2",
};
const NEW_ID = "f0000000-0000-4000-8000-0000000000f1";

let t: Awaited<ReturnType<typeof createTestDb>>;
const actor = (id: string, role: PanelUser["role"], name: string = role): PanelUser => ({
  id,
  fullName: name,
  email: `zolb-test+${name}@example.com`,
  role,
  isActive: true,
  mfaResetRequired: false,
});
const owner = actor(ids.owner, "owner");
const admin = actor(ids.admin, "admin");
const staff = actor(ids.staff, "staff");
const fresh = { fresh2fa: true, ipHash: "hash" };
const notFresh = { fresh2fa: false };

const rejects = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? (e as Error).message,
  );

let banned: Record<string, boolean>;
let invited: string[];
async function makeLogin(email: string) {
  await t.pg.query(
    `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, null)
     on conflict (id) do update set email = excluded.email`,
    [NEW_ID, email],
  );
}
async function dropNewLogin() {
  await t.pg.query(`delete from auth.users where id = $1`, [NEW_ID]);
}

const api: AuthAdminApi = {
  invite: async (email) => {
    invited.push(email);
    await makeLogin(email);
    return { id: NEW_ID };
  },
  resendInvite: async (email) => {
    invited.push(`again:${email}`);
  },
  setBanned: async (userId, value) => {
    banned[userId] = value;
  },
};
let removed: string[];
const passwordApi: AuthPasswordApi = {
  createWithPassword: async ({ email }) => {
    await makeLogin(email);
    return { id: NEW_ID };
  },
  remove: async (id) => {
    removed.push(id);
    await dropNewLogin();
  },
};

async function roleOf(id: string) {
  const [row] = await t.db.select().from(profiles).where(eq(profiles.id, id));
  return row;
}

beforeAll(async () => {
  t = await createTestDb({ supabase: true });
  await t.pg.exec(`
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('${ids.owner}', 'zolb-test+owner@example.com', '{"full_name":"Olivia Owner"}', now()),
      ('${ids.owner2}', 'zolb-test+owner2@example.com', '{"full_name":"Oscar Owner"}', now()),
      ('${ids.admin}', 'zolb-test+admin@example.com', '{"full_name":"Adam Admin"}', now()),
      ('${ids.admin2}', 'zolb-test+admin2@example.com', '{"full_name":"Alma Admin"}', now()),
      ('${ids.staff}', 'zolb-test+staff@example.com', '{"full_name":"Sam Staff"}', now()),
      ('${ids.staff2}', 'zolb-test+staff2@example.com', '{"full_name":"Sue Staff"}', now()),
      ('${ids.client}', 'zolb-test+client@example.com', '{"full_name":"Carla Client"}', now()),
      ('${ids.unverified}', 'zolb-test+unverified@example.com', '{"full_name":"Una Unverified"}', null),
      ('${ids.temp}', 'zolb-test+temp@example.com', '{"full_name":"Tom Temp"}', now());
    update profiles set role = 'owner' where id in ('${ids.owner}', '${ids.owner2}');
    update profiles set role = 'admin' where id in ('${ids.admin}', '${ids.admin2}');
    update profiles set role = 'staff' where id in ('${ids.staff}', '${ids.staff2}', '${ids.temp}');
    update profiles set must_change_password = true where id = '${ids.temp}';
    insert into auth.mfa_factors (user_id, status) values
      ('${ids.owner}', 'verified'), ('${ids.owner}', 'verified'), ('${ids.staff}', 'unverified');
  `);
}, 60_000);
afterAll(async () => t.close());

describe("invite", () => {
  it("needs the actor's fresh confirm, and a role that may invite", async () => {
    invited = [];
    const input = {
      email: "zolb-test+new@example.com",
      fullName: "New Person",
      role: "staff" as const,
    };
    expect(await rejects(inviteAccount(t.db, admin, api, input, notFresh))).toBe("needs-fresh-2fa");
    expect(await rejects(inviteAccount(t.db, staff, api, input, fresh))).toBe("wrong-role");
    expect(invited).toEqual([]);
  });
  it("makes the profile with the chosen role, and logs it", async () => {
    invited = [];
    await inviteAccount(
      t.db,
      admin,
      api,
      { email: "  ZOLB-test+New@example.com ", fullName: " New Person ", role: "staff" },
      fresh,
    );
    expect(invited).toEqual(["zolb-test+new@example.com"]);
    const row = await roleOf(NEW_ID);
    expect(row).toMatchObject({ role: "staff", fullName: "New Person", isActive: true });
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "account.invited"));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorId: ids.admin, entityId: NEW_ID });
  });
  it("refuses a second invite for the same email, a bad email and a bad name", async () => {
    const input = {
      email: "zolb-test+new@example.com",
      fullName: "New Person",
      role: "staff" as const,
    };
    expect(await rejects(inviteAccount(t.db, admin, api, input, fresh))).toBe("exists");
    expect(await rejects(inviteAccount(t.db, admin, api, { ...input, email: "bad" }, fresh))).toBe(
      "invalid",
    );
    expect(
      await rejects(
        inviteAccount(
          t.db,
          admin,
          api,
          { ...input, email: "zolb-test+n2@example.com", fullName: "X" },
          fresh,
        ),
      ),
    ).toBe("invalid");
  });
  it("only an owner can invite an owner", async () => {
    const input = {
      email: "zolb-test+boss@example.com",
      fullName: "Boss Person",
      role: "owner" as const,
    };
    expect(await rejects(inviteAccount(t.db, admin, api, input, fresh))).toBe("owner-only");
    await dropNewLogin();
    expect(await rejects(inviteAccount(t.db, owner, api, input, fresh))).toBe("ok");
    expect((await roleOf(NEW_ID)).role).toBe("owner");
    await dropNewLogin();
  });
});

describe("create with a temporary password", () => {
  const input = {
    email: "zolb-test+temp2@example.com",
    fullName: "Temp Person",
    role: "staff" as const,
    temporaryPassword: "Correct-Horse-Battery-9",
  };
  it("makes the account, requires a new password at first sign in, and never logs the password", async () => {
    removed = [];
    await createAccountWithPassword(t.db, admin, passwordApi, input, fresh);
    expect(await roleOf(NEW_ID)).toMatchObject({ role: "staff", mustChangePassword: true });
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "account.created"));
    expect(JSON.stringify(log)).not.toContain(input.temporaryPassword);
    await dropNewLogin();
  });
  it("refuses a weak password, a staff actor and an owner role from an admin", async () => {
    expect(
      await rejects(
        createAccountWithPassword(
          t.db,
          admin,
          passwordApi,
          { ...input, temporaryPassword: "short" },
          fresh,
        ),
      ),
    ).toBe("invalid");
    expect(await rejects(createAccountWithPassword(t.db, staff, passwordApi, input, fresh))).toBe(
      "wrong-role",
    );
    expect(
      await rejects(
        createAccountWithPassword(t.db, admin, passwordApi, { ...input, role: "owner" }, fresh),
      ),
    ).toBe("owner-only");
  });
  it("removes the new login again when saving fails", async () => {
    removed = [];
    // The id of an existing profile with a different email: the insert collides on the unique email? Use
    // a role the database refuses instead: a staff actor id that does not exist as a profile row.
    const ghost = actor("99999999-9999-4999-8999-999999999999", "admin", "ghost");
    const result = await rejects(createAccountWithPassword(t.db, ghost, passwordApi, input, fresh));
    expect(result).not.toBe("ok");
    expect(removed).toEqual([NEW_ID]);
  });
});

describe("change role", () => {
  it("needs the confirm and the right role", async () => {
    expect(
      await rejects(changeRole(t.db, admin, { accountId: ids.staff2, role: "admin" }, notFresh)),
    ).toBe("needs-fresh-2fa");
    expect(
      await rejects(changeRole(t.db, staff, { accountId: ids.staff2, role: "admin" }, fresh)),
    ).toBe("wrong-role");
  });
  it("nobody changes their own role", async () => {
    expect(
      await rejects(changeRole(t.db, admin, { accountId: ids.admin, role: "owner" }, fresh)),
    ).toBe("self");
    expect(
      await rejects(changeRole(t.db, owner, { accountId: ids.owner, role: "staff" }, fresh)),
    ).toBe("self");
  });
  it("an admin can promote staff and a client, and demote an admin", async () => {
    const change = await changeRole(t.db, admin, { accountId: ids.staff2, role: "admin" }, fresh);
    expect(change).toMatchObject({
      from: "staff",
      to: "admin",
      email: "zolb-test+staff2@example.com",
    });
    expect((await roleOf(ids.staff2)).role).toBe("admin");
    await changeRole(t.db, admin, { accountId: ids.client, role: "staff" }, fresh);
    expect((await roleOf(ids.client)).role).toBe("staff");
    await changeRole(t.db, admin, { accountId: ids.client, role: "user" }, fresh);
    // A demotion signs the person out everywhere.
    expect((await roleOf(ids.client)).sessionsRevokedAt).toBeInstanceOf(Date);
    expect((await roleOf(ids.staff2)).sessionsRevokedAt).toBeNull();
  });
  it("returns null (no email) when the role does not change", async () => {
    expect(
      await changeRole(t.db, admin, { accountId: ids.staff2, role: "admin" }, fresh),
    ).toBeNull();
  });
  it("an admin cannot make an owner, demote an owner or touch one", async () => {
    expect(
      await rejects(changeRole(t.db, admin, { accountId: ids.staff, role: "owner" }, fresh)),
    ).toBe("owner-only");
    expect(
      await rejects(changeRole(t.db, admin, { accountId: ids.owner2, role: "staff" }, fresh)),
    ).toBe("owner-only");
    expect((await roleOf(ids.owner2)).role).toBe("owner");
  });
  it("an owner can make an owner and demote one (another owner stays)", async () => {
    await changeRole(t.db, owner, { accountId: ids.staff, role: "owner" }, fresh);
    expect((await roleOf(ids.staff)).role).toBe("owner");
    await changeRole(t.db, owner, { accountId: ids.staff, role: "staff" }, fresh);
    await changeRole(t.db, owner, { accountId: ids.admin2, role: "staff" }, fresh);
    await changeRole(t.db, owner, { accountId: ids.admin2, role: "admin" }, fresh);
  });
  it("writes who, whom, old and new value to the activity log", async () => {
    const log = await t.db.select().from(activityLog).where(eq(activityLog.action, "role.changed"));
    const entry = log.find((row) => row.entityId === ids.staff2)!;
    expect(entry.actorId).toBe(ids.admin);
    expect(entry.details).toMatchObject({ from: "staff", to: "admin" });
    expect(entry.createdAt).toBeInstanceOf(Date);
  });
  it("the database stops the last active owner from being demoted", async () => {
    await t.pg.exec(`update profiles set role = 'staff' where id = '${ids.owner2}'`);
    // Only `owner` is left. An owner acting as someone else cannot remove them: the database refuses.
    const pretend = actor(ids.owner2, "owner", "owner2");
    expect(
      await rejects(changeRole(t.db, pretend, { accountId: ids.owner, role: "staff" }, fresh)),
    ).not.toBe("ok");
    expect((await roleOf(ids.owner)).role).toBe("owner");
    await t.pg.exec(`update profiles set role = 'owner' where id = '${ids.owner2}'`);
  });
});

describe("turn off and on", () => {
  it("turns an account off, signs the person out everywhere, and bans the login", async () => {
    banned = {};
    const result = await setAccountActive(
      t.db,
      admin,
      api,
      { accountId: ids.staff2, active: false },
      fresh,
    );
    expect(result).toMatchObject({ active: false, email: "zolb-test+staff2@example.com" });
    const row = await roleOf(ids.staff2);
    expect(row.isActive).toBe(false);
    expect(row.sessionsRevokedAt).toBeInstanceOf(Date);
    expect(banned[ids.staff2]).toBe(true);
    await setAccountActive(t.db, admin, api, { accountId: ids.staff2, active: true }, fresh);
    expect((await roleOf(ids.staff2)).isActive).toBe(true);
    expect(banned[ids.staff2]).toBe(false);
  });
  it("works for a client too", async () => {
    await setAccountActive(t.db, admin, api, { accountId: ids.client, active: false }, fresh);
    expect((await roleOf(ids.client)).isActive).toBe(false);
  });
  it("not yourself, not without a confirm, not as staff, and an admin cannot turn an owner off", async () => {
    expect(
      await rejects(
        setAccountActive(t.db, admin, api, { accountId: ids.admin, active: false }, fresh),
      ),
    ).toBe("self");
    expect(
      await rejects(
        setAccountActive(t.db, admin, api, { accountId: ids.client, active: true }, notFresh),
      ),
    ).toBe("needs-fresh-2fa");
    expect(
      await rejects(
        setAccountActive(t.db, staff, api, { accountId: ids.client, active: true }, fresh),
      ),
    ).toBe("wrong-role");
    expect(
      await rejects(
        setAccountActive(t.db, admin, api, { accountId: ids.owner2, active: false }, fresh),
      ),
    ).toBe("owner-only");
  });
  it("returns null when nothing changes", async () => {
    expect(
      await setAccountActive(t.db, admin, api, { accountId: ids.staff2, active: true }, fresh),
    ).toBeNull();
  });
  it("logs both directions", async () => {
    const off = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "account.turned_off"));
    const on = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "account.turned_on"));
    expect(off.length).toBeGreaterThanOrEqual(2);
    expect(on.length).toBeGreaterThanOrEqual(1);
  });
});

describe("resend the invitation", () => {
  it("sends again only to someone who has not verified the email", async () => {
    invited = [];
    await resendInvite(t.db, admin, api, { accountId: ids.unverified }, fresh);
    expect(invited).toEqual(["again:zolb-test+unverified@example.com"]);
    expect(await rejects(resendInvite(t.db, admin, api, { accountId: ids.staff }, fresh))).toBe(
      "invalid",
    );
    expect(
      await rejects(resendInvite(t.db, staff, api, { accountId: ids.unverified }, fresh)),
    ).toBe("wrong-role");
  });
});

describe("the accounts table (server side)", () => {
  it("returns a page with the total, sorted by email", async () => {
    const { rows, total } = await listAccounts(t.db, { perPage: 10 });
    expect(total).toBe(9);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.email)).toEqual([...rows.map((r) => r.email)].sort());
  });
  it("pages and clamps a page that is too high", async () => {
    const first = await listAccounts(t.db, { perPage: 10, page: 1 });
    expect(first.rows).toHaveLength(9);
    const small = await listAccounts(t.db, { perPage: 10, page: 99 });
    expect(small.page).toBe(1);
  });
  it("searches name and email, and treats % and _ as plain characters", async () => {
    expect((await listAccounts(t.db, { q: "olivia" })).rows.map((r) => r.id)).toEqual([ids.owner]);
    expect((await listAccounts(t.db, { q: "ZOLB-TEST+STAFF2" })).total).toBe(1);
    expect((await listAccounts(t.db, { q: "%" })).total).toBe(0);
    expect((await listAccounts(t.db, { q: "_" })).total).toBe(0);
  });
  it("filters by role", async () => {
    const owners = await listAccounts(t.db, { role: "owner" });
    expect(owners.rows.map((r) => r.role)).toEqual(["owner", "owner"]);
    // The client and the person who has not verified the email are both clients.
    const clients = (await listAccounts(t.db, { role: "user" })).rows.map((r) => r.id);
    expect(clients.sort()).toEqual([ids.client, ids.unverified].sort());
  });
  it("filters by status and shows the right status", async () => {
    const all = (await listAccounts(t.db, { perPage: 50 })).rows;
    const byId = Object.fromEntries(all.map((r) => [r.id, r.status]));
    expect(byId[ids.client]).toBe("turned_off");
    expect(byId[ids.temp]).toBe("invited");
    expect(byId[ids.unverified]).toBe("unverified");
    expect(byId[ids.owner]).toBe("active");
    expect((await listAccounts(t.db, { status: "turned_off" })).rows.map((r) => r.id)).toEqual([
      ids.client,
    ]);
    expect((await listAccounts(t.db, { status: "invited" })).rows.map((r) => r.id)).toEqual([
      ids.temp,
    ]);
    expect((await listAccounts(t.db, { status: "unverified" })).rows.map((r) => r.id)).toEqual([
      ids.unverified,
    ]);
    const active = (await listAccounts(t.db, { status: "active", perPage: 50 })).rows.map(
      (r) => r.id,
    );
    expect(active).not.toContain(ids.client);
    expect(active).not.toContain(ids.temp);
    expect(active).not.toContain(ids.unverified);
  });
  it("shows 2-step login On or Off for panel roles, and nothing for clients", async () => {
    const rows = Object.fromEntries(
      (await listAccounts(t.db, { perPage: 50 })).rows.map((r) => [r.id, r]),
    );
    expect(rows[ids.owner].twoFactor).toBe(true);
    expect(rows[ids.admin].twoFactor).toBe(false);
    // An unverified device does not count.
    expect(rows[ids.staff].twoFactor).toBe(false);
    expect(rows[ids.client].twoFactor).toBeNull();
  });
});
