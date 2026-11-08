// Proves the role rules in the DATABASE (drizzle/0006_single_role.sql), on a real Postgres (PGlite) with a tiny
// fake of Supabase:
//   - private.role_can() says the same as the TypeScript table in src/lib/permissions.ts, cell by cell
//   - private.can() follows the logged-in person (staff, admin, owner; not a client; not a turned-off account)
//   - the "actor" triggers refuse what a role may not do, even if the code forgot the check
//   - the last active owner can never be lost
// Test data uses zolb-test+...@example.com emails only.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACTIONS, ROLES, can } from "@/lib/permissions";

import { createTestDb } from "../helpers/test-db";

const OWNER = "a0000000-0000-4000-8000-0000000000a1";
const OWNER2 = "a0000000-0000-4000-8000-0000000000a2";
const ADMIN = "b0000000-0000-4000-8000-0000000000b1";
const STAFF = "c0000000-0000-4000-8000-0000000000c1";
const OFF_STAFF = "c0000000-0000-4000-8000-0000000000c2";
const CLIENT = "d0000000-0000-4000-8000-0000000000d1";

let t: Awaited<ReturnType<typeof createTestDb>>;
let serviceId: string;
let paymentId: string;
let requirementId: string;

beforeAll(async () => {
  t = await createTestDb({ supabase: true });
  await t.pg.exec(`
    insert into auth.users (id, email) values
      ('${OWNER}', 'zolb-test+o1@example.com'),
      ('${OWNER2}', 'zolb-test+o2@example.com'),
      ('${ADMIN}', 'zolb-test+ad@example.com'),
      ('${STAFF}', 'zolb-test+s@example.com'),
      ('${OFF_STAFF}', 'zolb-test+off@example.com'),
      ('${CLIENT}', 'zolb-test+c@example.com');
    update profiles set role = 'owner' where id in ('${OWNER}', '${OWNER2}');
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'staff' where id = '${STAFF}';
    update profiles set role = 'staff', is_active = false where id = '${OFF_STAFF}';
    insert into services (slug, name) values ('svc', 'Sample service');
    insert into payment_methods (name, account_name, account_number) values ('Sample', 'Sample Name', '0000');
  `);
  serviceId = (await t.pg.query<{ id: string }>(`select id from services limit 1`)).rows[0].id;
  requirementId = (
    await t.pg.query<{ id: string }>(
      `insert into service_requirements (service_id, label) values ($1, 'Item') returning id`,
      [serviceId],
    )
  ).rows[0].id;
  const requestId = (
    await t.pg.query<{ id: string }>(
      `insert into requests (tracking_code, service_id, client_full_name, client_email, client_phone,
         client_phone_last4, consent_version, consent_at)
       values ('RG-ROLESDB1', $1, 'Test Client', 'zolb-test+x@example.com', '+639000000000', '0000', 'v1', now())
       returning id`,
      [serviceId],
    )
  ).rows[0].id;
  const methodId = (await t.pg.query<{ id: string }>(`select id from payment_methods limit 1`))
    .rows[0].id;
  paymentId = (
    await t.pg.query<{ id: string }>(
      `insert into payments (request_id, payment_method_id, method_snapshot, reference_number,
         amount_centavos, paid_on, entry_method)
       values ($1, $2, '{}'::jsonb, 'REFROLES1', 100, '2026-01-01', 'manual') returning id`,
      [requestId, methodId],
    )
  ).rows[0].id;
}, 60_000);
afterAll(async () => t.close());

// Runs one statement while the database "knows" who is acting, then rolls back. Returns the error text or null.
async function asActor(actorId: string | null, sql: string, params: unknown[] = []) {
  await t.pg.exec("BEGIN");
  try {
    if (actorId) await t.pg.query(`select set_config('app.actor_id', $1, true)`, [actorId]);
    await t.pg.query(sql, params);
    return null as string | null;
  } catch (error) {
    return (error as Error).message;
  } finally {
    await t.pg.exec("ROLLBACK");
  }
}

describe("private.role_can() equals the TypeScript table", () => {
  it("agrees for every role and every action", async () => {
    for (const role of ROLES) {
      for (const action of ACTIONS) {
        const result = await t.pg.query<{ ok: boolean }>(
          `select private.role_can($1::public.account_role, $2) as ok`,
          [role, action],
        );
        expect(result.rows[0].ok, `${role} ${action}`).toBe(can(role, action));
      }
    }
  });
  it("says no to an action it does not know", async () => {
    const result = await t.pg.query<{ ok: boolean }>(
      `select private.role_can('owner'::public.account_role, 'nothing.here') as ok`,
    );
    expect(result.rows[0].ok).toBe(false);
  });
});

describe("private.can() follows the signed-in person", () => {
  async function canAs(userId: string, action: string) {
    await t.pg.exec("BEGIN");
    try {
      await t.pg.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      const result = await t.pg.query<{ ok: boolean }>(`select private.can($1) as ok`, [action]);
      return result.rows[0].ok;
    } finally {
      await t.pg.exec("ROLLBACK");
    }
  }
  it("matches the table for each real account", async () => {
    const accounts: [string, (typeof ROLES)[number]][] = [
      [OWNER, "owner"],
      [ADMIN, "admin"],
      [STAFF, "staff"],
      [CLIENT, "user"],
    ];
    for (const [id, role] of accounts) {
      for (const action of ACTIONS)
        expect(await canAs(id, action), `${role} ${action}`).toBe(can(role, action));
    }
  });
  it("is always false for a turned-off account", async () => {
    expect(await canAs(OFF_STAFF, "requests.view")).toBe(false);
  });
});

describe("staff are stopped by the database (second layer)", () => {
  it("cannot verify or reject a payment, but an admin can", async () => {
    const verify = `update payments set status = 'verified' where id = $1`;
    expect(await asActor(STAFF, verify, [paymentId])).toMatch(/Staff cannot verify/);
    expect(
      await asActor(STAFF, `update payments set status = 'rejected' where id = $1`, [paymentId]),
    ).toMatch(/Staff cannot verify/);
    expect(await asActor(ADMIN, verify, [paymentId])).toBeNull();
  });
  it("cannot change a fee, hide a service or reorder, but can change words", async () => {
    expect(
      await asActor(STAFF, `update services set fee_centavos = 100 where id = $1`, [serviceId]),
    ).toMatch(/Staff cannot change a fee/);
    expect(
      await asActor(STAFF, `update services set is_active = false where id = $1`, [serviceId]),
    ).toMatch(/Staff cannot change a fee/);
    expect(
      await asActor(STAFF, `update services set sort_order = 9 where id = $1`, [serviceId]),
    ).toMatch(/Staff cannot change a fee/);
    expect(
      await asActor(STAFF, `update services set name = 'New words' where id = $1`, [serviceId]),
    ).toBeNull();
    expect(
      await asActor(ADMIN, `update services set fee_centavos = 100 where id = $1`, [serviceId]),
    ).toBeNull();
  });
  it("can add a service only when it is hidden and has no fee", async () => {
    const insert = (active: boolean, fee: string) =>
      `insert into services (slug, name, is_active, fee_centavos) values ('x${active}${fee}', 'X', ${active}, ${fee})`;
    expect(await asActor(STAFF, insert(true, "null"))).toMatch(/hidden and has no fee/);
    expect(await asActor(STAFF, insert(false, "500"))).toMatch(/hidden and has no fee/);
    expect(await asActor(STAFF, insert(false, "null"))).toBeNull();
  });
  it("cannot change the payment methods of a service", async () => {
    const methodId = (await t.pg.query<{ id: string }>(`select id from payment_methods limit 1`))
      .rows[0].id;
    const link = `insert into service_payment_methods (service_id, payment_method_id) values ($1, $2)`;
    expect(await asActor(STAFF, link, [serviceId, methodId])).toMatch(/Staff cannot change this/);
    expect(await asActor(ADMIN, link, [serviceId, methodId])).toBeNull();
  });
  it("cannot delete anything", async () => {
    expect(
      await asActor(STAFF, `delete from service_requirements where id = $1`, [requirementId]),
    ).toMatch(/Staff cannot change this/);
    expect(await asActor(STAFF, `delete from services where id = $1`, [serviceId])).toMatch(
      /Staff cannot change this/,
    );
    expect(await asActor(STAFF, `delete from payment_methods`)).toMatch(/Staff cannot change this/);
    expect(await asActor(STAFF, `delete from requests`)).toMatch(/Staff cannot change this/);
    expect(await asActor(STAFF, `delete from profiles where id = $1`, [CLIENT])).toMatch(
      /Staff cannot change this/,
    );
    expect(
      await asActor(ADMIN, `delete from service_requirements where id = $1`, [requirementId]),
    ).toBeNull();
  });
  it("cannot change a role or turn an account off", async () => {
    expect(
      await asActor(STAFF, `update profiles set role = 'admin' where id = $1`, [CLIENT]),
    ).toMatch(/not allowed to change a role/);
    expect(
      await asActor(STAFF, `update profiles set is_active = false where id = $1`, [CLIENT]),
    ).toMatch(/not allowed to change a role/);
  });
  it("is not stopped when no actor is set (seed, cleanup job, SQL editor)", async () => {
    expect(
      await asActor(null, `update services set fee_centavos = 100 where id = $1`, [serviceId]),
    ).toBeNull();
  });
});

describe("accounts: who may change whom (database)", () => {
  it("nobody can change their own role or turn themselves off", async () => {
    expect(
      await asActor(ADMIN, `update profiles set role = 'owner' where id = $1`, [ADMIN]),
    ).toMatch(/cannot change your own role/);
    expect(
      await asActor(OWNER, `update profiles set is_active = false where id = $1`, [OWNER]),
    ).toMatch(/cannot change your own role/);
  });
  it("an admin cannot touch an owner, or make someone an owner", async () => {
    expect(
      await asActor(ADMIN, `update profiles set role = 'staff' where id = $1`, [OWNER2]),
    ).toMatch(/Only an owner/);
    expect(
      await asActor(ADMIN, `update profiles set is_active = false where id = $1`, [OWNER2]),
    ).toMatch(/Only an owner/);
    expect(
      await asActor(ADMIN, `update profiles set role = 'owner' where id = $1`, [STAFF]),
    ).toMatch(/Only an owner/);
  });
  it("an owner can change an admin, a staff member and another owner", async () => {
    expect(
      await asActor(OWNER, `update profiles set role = 'staff' where id = $1`, [ADMIN]),
    ).toBeNull();
    expect(
      await asActor(OWNER, `update profiles set role = 'admin' where id = $1`, [STAFF]),
    ).toBeNull();
    expect(
      await asActor(OWNER, `update profiles set role = 'staff' where id = $1`, [OWNER2]),
    ).toBeNull();
  });
  it("an admin can change a staff member and a client", async () => {
    expect(
      await asActor(ADMIN, `update profiles set role = 'admin' where id = $1`, [STAFF]),
    ).toBeNull();
    expect(
      await asActor(ADMIN, `update profiles set is_active = false where id = $1`, [CLIENT]),
    ).toBeNull();
  });
  it("other fields (name, last sign in, reset flags) are not blocked", async () => {
    expect(
      await asActor(STAFF, `update profiles set last_login_at = now() where id = $1`, [STAFF]),
    ).toBeNull();
    expect(
      await asActor(ADMIN, `update profiles set mfa_reset_required = true where id = $1`, [OWNER]),
    ).toBeNull();
  });
});

describe("the last active owner", () => {
  it("cannot be demoted, turned off or deleted, even with no actor", async () => {
    // Make OWNER2 a staff member for real, so OWNER is the only owner left.
    await t.pg.exec(`update profiles set role = 'staff' where id = '${OWNER2}'`);
    expect(
      await asActor(null, `update profiles set role = 'admin' where id = $1`, [OWNER]),
    ).toMatch(/at least one active owner/);
    expect(
      await asActor(null, `update profiles set is_active = false where id = $1`, [OWNER]),
    ).toMatch(/at least one active owner/);
    expect(await asActor(null, `delete from profiles where id = $1`, [OWNER])).toMatch(
      /at least one active owner/,
    );
  });
});
