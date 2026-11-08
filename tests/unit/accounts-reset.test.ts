// Reset 2-step login for ANOTHER person (a lost phone), and the emails after an account change.
// Uses the fake Supabase (auth.users, auth.mfa_factors). Test emails are zolb-test+...@example.com only.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PanelUser } from "@/server/auth/panel-core";
import { activityLog, profiles } from "@/server/db/schema";
import { notifyAccountChange } from "@/server/email/notify";
import type { EmailContext } from "@/server/email/send";
import { changeRole, reset2fa, type AuthMfaAdminApi } from "@/server/services/accounts";

import { createTestDb } from "../helpers/test-db";

const ids = {
  owner: "a0000000-0000-4000-8000-0000000000a1",
  owner2: "a0000000-0000-4000-8000-0000000000a2",
  admin: "b0000000-0000-4000-8000-0000000000b1",
  admin2: "b0000000-0000-4000-8000-0000000000b2",
  staff: "c0000000-0000-4000-8000-0000000000c1",
  staff2: "c0000000-0000-4000-8000-0000000000c2",
  client: "d0000000-0000-4000-8000-0000000000d1",
};
const emailOf = (key: keyof typeof ids) => `zolb-test+${key}@example.com`;

let t: Awaited<ReturnType<typeof createTestDb>>;
const actor = (key: keyof typeof ids, role: PanelUser["role"]): PanelUser => ({
  id: ids[key],
  fullName: key,
  email: emailOf(key),
  role,
  isActive: true,
  mfaResetRequired: false,
});
const owner = actor("owner", "owner");
const admin = actor("admin", "admin");
const staff = actor("staff", "staff");
const fresh = { fresh2fa: true, ipHash: "hash" };
const notFresh = { fresh2fa: false };

const rejects = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => (e as { code?: string }).code ?? (e as Error).message,
  );
const rowOf = async (id: string) =>
  (await t.db.select().from(profiles).where(eq(profiles.id, id)))[0];

// The fake Supabase admin: the devices are in auth.mfa_factors.
const mfaApi = (calls: string[] = []): AuthMfaAdminApi => ({
  listFactors: async (userId) => {
    const result = await t.pg.query<{ id: string; status: string }>(
      `select id, status from auth.mfa_factors where user_id = $1`,
      [userId],
    );
    return result.rows.map((row) => ({ id: row.id, verified: row.status === "verified" }));
  },
  deleteFactor: async (userId, factorId) => {
    calls.push(`delete:${factorId}`);
    await t.pg.query(`delete from auth.mfa_factors where id = $1 and user_id = $2`, [
      factorId,
      userId,
    ]);
  },
});

beforeAll(async () => {
  t = await createTestDb({ supabase: true });
  const users = Object.entries(ids)
    .map(
      ([key, id]) => `('${id}', '${emailOf(key as keyof typeof ids)}', '{"full_name":"${key}"}')`,
    )
    .join(", ");
  await t.pg.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values ${users};
    update profiles set role = 'owner' where id in ('${ids.owner}', '${ids.owner2}');
    update profiles set role = 'admin' where id in ('${ids.admin}', '${ids.admin2}');
    update profiles set role = 'staff' where id in ('${ids.staff}', '${ids.staff2}');
  `);
}, 60_000);
afterAll(async () => t.close());

describe("reset 2-step login", () => {
  it("needs the actor's confirm, the right role, and the other person's full email", async () => {
    const calls: string[] = [];
    const api = mfaApi(calls);
    const input = { accountId: ids.staff2, confirmEmail: emailOf("staff2") };
    expect(await rejects(reset2fa(t.db, admin, api, input, notFresh))).toBe("needs-fresh-2fa");
    expect(await rejects(reset2fa(t.db, staff, api, input, fresh))).toBe("wrong-role");
    const wrong = { ...input, confirmEmail: "wrong@example.com" };
    expect(await rejects(reset2fa(t.db, admin, api, wrong, fresh))).toBe("invalid");
    expect(await rejects(reset2fa(t.db, admin, api, { ...input, confirmEmail: "" }, fresh))).toBe(
      "invalid",
    );
    expect(calls).toEqual([]);
    expect((await rowOf(ids.staff2)).mfaResetRequired).toBe(false);
  });

  it("nobody resets their own 2-step login", async () => {
    const input = { accountId: ids.admin, confirmEmail: emailOf("admin") };
    expect(await rejects(reset2fa(t.db, admin, mfaApi(), input, fresh))).toBe("self");
  });

  it("a client has no 2-step login to reset", async () => {
    const input = { accountId: ids.client, confirmEmail: emailOf("client") };
    expect(await rejects(reset2fa(t.db, admin, mfaApi(), input, fresh))).toBe("invalid");
  });

  it("removes every device, signs the person out, forces a new setup, and logs it", async () => {
    await t.pg.exec(`insert into auth.mfa_factors (user_id, status) values
      ('${ids.staff2}', 'verified'), ('${ids.staff2}', 'verified'), ('${ids.staff2}', 'unverified')`);
    const calls: string[] = [];
    const result = await reset2fa(
      t.db,
      admin,
      mfaApi(calls),
      { accountId: ids.staff2, confirmEmail: `  ${emailOf("staff2").toUpperCase()} ` },
      fresh,
    );
    expect(result).toMatchObject({ email: emailOf("staff2"), factorsRemoved: 3, role: "staff" });
    expect(calls).toHaveLength(3);
    const left = await t.pg.query(`select 1 from auth.mfa_factors where user_id = $1`, [
      ids.staff2,
    ]);
    expect(left.rows).toHaveLength(0);
    const row = await rowOf(ids.staff2);
    expect(row.mfaResetRequired).toBe(true);
    expect(row.sessionsRevokedAt).toBeInstanceOf(Date);
    const log = await t.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "account.2fa_reset"));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorId: ids.admin, entityId: ids.staff2 });
    expect(log[0].details).toMatchObject({ factorsRemoved: 3 });
  });

  it("an owner can reset an admin, and an admin can reset an owner (a lost owner phone)", async () => {
    const adminTarget = { accountId: ids.admin2, confirmEmail: emailOf("admin2") };
    await reset2fa(t.db, owner, mfaApi(), adminTarget, fresh);
    expect((await rowOf(ids.admin2)).mfaResetRequired).toBe(true);

    const ownerTarget = { accountId: ids.owner2, confirmEmail: emailOf("owner2") };
    const result = await reset2fa(t.db, admin, mfaApi(), ownerTarget, fresh);
    expect(result.role).toBe("owner");
    expect((await rowOf(ids.owner2)).mfaResetRequired).toBe(true);
    // An admin still may not demote or turn off that owner.
    const demote = changeRole(t.db, admin, { accountId: ids.owner2, role: "staff" }, fresh);
    expect(await rejects(demote)).toBe("owner-only");
  });

  it("is safe when removing a device fails: the forced setup is already in place", async () => {
    await t.pg.exec(
      `insert into auth.mfa_factors (user_id, status) values ('${ids.staff}', 'verified')`,
    );
    const broken: AuthMfaAdminApi = {
      listFactors: mfaApi().listFactors,
      deleteFactor: async () => {
        throw new Error("Supabase is down");
      },
    };
    const input = { accountId: ids.staff, confirmEmail: emailOf("staff") };
    await expect(reset2fa(t.db, owner, broken, input, fresh)).rejects.toThrow("Supabase is down");
    expect((await rowOf(ids.staff)).mfaResetRequired).toBe(true);
  });
});

describe("emails after an account change", () => {
  function context() {
    const sent: { to: string; subject: string; text: string }[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      sent.push({ to: body.to[0].email, subject: body.subject, text: body.textContent });
      return new Response(JSON.stringify({ messageId: "<id>" }), { status: 201 });
    });
    const ctx: EmailContext = {
      brevo: { apiKey: "KEY", fromAddress: "from@example.com", fromName: "RG" },
      baseUrl: "https://example.test",
      adminNotifyEmail: undefined,
      fetchImpl: fetchImpl as never,
    };
    return { ctx, sent };
  }

  it("tells the person about a role change, with who did it and the old and new role", async () => {
    const { ctx, sent } = context();
    await notifyAccountChange(
      {
        kind: "role_changed",
        id: ids.staff2,
        email: emailOf("staff2"),
        fullName: "Sue Staff",
        actorName: "Adam Admin",
        from: "staff",
        to: "admin",
      },
      { db: t.db, ctx },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(emailOf("staff2"));
    expect(sent[0].text).toContain("from Staff to Admin");
    expect(sent[0].text).toContain("Changed by: Adam Admin");
  });

  it("tells the person when the account is turned off, and on", async () => {
    const { ctx, sent } = context();
    for (const kind of ["turned_off", "turned_on"] as const) {
      const change = {
        kind,
        id: ids.client,
        email: emailOf("client"),
        fullName: "Carla",
        actorName: "Adam Admin",
      };
      await notifyAccountChange(change, { db: t.db, ctx });
    }
    expect(sent.map((m) => m.subject)).toEqual([
      "Your account was turned off",
      "Your account was turned on",
    ]);
  });

  it("a reset of a STAFF member emails only that person", async () => {
    const { ctx, sent } = context();
    const change = {
      kind: "2fa_reset" as const,
      id: ids.staff2,
      email: emailOf("staff2"),
      fullName: "Sue",
      actorName: "Adam Admin",
      role: "staff" as const,
    };
    await notifyAccountChange(change, { db: t.db, ctx });
    expect(sent.map((m) => m.to)).toEqual([emailOf("staff2")]);
  });

  it("a reset of an OWNER emails that owner and ALL other active owners", async () => {
    const { ctx, sent } = context();
    const change = {
      kind: "2fa_reset" as const,
      id: ids.owner2,
      email: emailOf("owner2"),
      fullName: "Oscar",
      actorName: "Adam Admin",
      role: "owner" as const,
    };
    await notifyAccountChange(change, { db: t.db, ctx });
    // Every active owner (owner and owner2). owner2 gets one email, not two.
    expect(sent.map((m) => m.to).sort()).toEqual([emailOf("owner"), emailOf("owner2")].sort());
    const toOtherOwner = sent.find((m) => m.to === emailOf("owner"))!;
    expect(toOtherOwner.subject).toBe("An owner's 2-step login was reset");
  });

  it("never puts a secret in an email", async () => {
    const { ctx, sent } = context();
    const change = {
      kind: "2fa_reset" as const,
      id: ids.staff2,
      email: emailOf("staff2"),
      fullName: "Sue",
      actorName: "Adam",
      role: "staff" as const,
    };
    await notifyAccountChange(change, { db: t.db, ctx });
    expect(JSON.stringify(sent)).not.toMatch(/KEY|secret/i);
  });
});
