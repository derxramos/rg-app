// Proves the account rules in the DATABASE, with a tiny fake of Supabase (see tests/helpers/fake-supabase.ts):
//   - every new sign-up gets a profile with role "user"
//   - a user sees only their own requests, payments, files and client notes
//   - a user cannot change their own role (two separate locks)
//   - the public "anon" role sees nothing
//   - an active admin sees everything
// "As user X" means: set the logged-in user, then switch to the "authenticated" role, like the real
// Supabase API (and our withUserRls helper) does. Test data uses zolb-test+...@example.com emails only.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb } from "../helpers/test-db";

const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const ADMIN = "c0000000-0000-4000-8000-00000000000c";
const IDLE_ADMIN = "d0000000-0000-4000-8000-00000000000d";

let t: Awaited<ReturnType<typeof createTestDb>>;
let requestA: string;
let requestB: string;

// Runs one statement as a role and always rolls back, so tests do not affect each other.
async function tryAs(role: "authenticated" | "anon", userId: string | null, sql: string) {
  await t.pg.exec("BEGIN");
  try {
    if (userId) {
      await t.pg.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role }),
      ]);
    }
    await t.pg.exec(`SET LOCAL ROLE ${role}`);
    const result = await t.pg.query<Record<string, unknown>>(sql);
    return { rows: result.rows, affected: result.affectedRows ?? 0, error: null as string | null };
  } catch (error) {
    return { rows: [], affected: 0, error: (error as Error).message };
  } finally {
    await t.pg.exec("ROLLBACK");
  }
}
const asUser = (userId: string, sql: string) => tryAs("authenticated", userId, sql);

beforeAll(async () => {
  t = await createTestDb({ supabase: true });
  const { pg } = t;

  // Sign-ups. The trigger must make the profiles. A bad sign-up tries to sneak in the role admin.
  await pg.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'zolb-test+a@example.com', '{"full_name":"User A"}'),
      ('${B}', 'zolb-test+b@example.com', '{"full_name":"User B","role":"admin"}'),
      ('${ADMIN}', 'zolb-test+admin@example.com', '{"full_name":"Admin"}'),
      ('${IDLE_ADMIN}', 'zolb-test+idle@example.com', '{"full_name":"Idle admin"}');
    update profiles set role = 'admin' where id in ('${ADMIN}', '${IDLE_ADMIN}');
    insert into admin_profiles (id, full_name, email, role, is_active) values
      ('${ADMIN}', 'Admin', 'zolb-test+admin@example.com', 'owner', true),
      ('${IDLE_ADMIN}', 'Idle admin', 'zolb-test+idle@example.com', 'staff', false);
    insert into services (slug, name) values ('svc', 'Sample service');
    insert into payment_methods (name, account_name, account_number) values ('Sample', 'Sample Name', '0000');
  `);

  const service = (await pg.query<{ id: string }>(`select id from services limit 1`)).rows[0].id;
  const insertRequest = async (userId: string, code: string) =>
    (
      await pg.query<{ id: string }>(
        `insert into requests (tracking_code, service_id, user_id, client_full_name, client_email,
           client_phone, client_phone_last4, consent_version, consent_at, draft_token_hash)
         values ($1, $2, $3, 'Test Client', 'zolb-test+c@example.com', '+639000000000', '0000', 'v1', now(), 'secret-hash')
         returning id`,
        [code, service, userId],
      )
    ).rows[0].id;
  requestA = await insertRequest(A, "RG-AAAAAAAA");
  requestB = await insertRequest(B, "RG-BBBBBBBB");
  // An old guest request with no owner.
  await pg.query(
    `insert into requests (tracking_code, service_id, client_full_name, client_email, client_phone,
       client_phone_last4, consent_version, consent_at)
     values ('RG-GUESTGST', $1, 'Guest', 'zolb-test+g@example.com', '+639000000000', '0000', 'v1', now())`,
    [service],
  );

  const method = (await pg.query<{ id: string }>(`select id from payment_methods limit 1`)).rows[0]
    .id;
  for (const [request, reference] of [
    [requestA, "REFA1"],
    [requestB, "REFB1"],
  ]) {
    await pg.query(
      `insert into payments (request_id, payment_method_id, method_snapshot, reference_number,
         amount_centavos, paid_on, entry_method)
       values ($1, $2, '{}'::jsonb, $3, 10000, '2026-11-01', 'manual')`,
      [request, method, reference],
    );
    await pg.query(
      `insert into request_files (request_id, storage_path, original_name, mime_type, size_bytes)
       values ($1, $2, 'file.jpg', 'image/jpeg', 100)`,
      [request, `users/x/requests/${request}/f.jpg`],
    );
    await pg.query(
      `insert into request_notes (request_id, author_id, visibility, body) values
         ($1, '${ADMIN}', 'internal', 'internal only'),
         ($1, '${ADMIN}', 'client', 'hello client')`,
      [request],
    );
  }
}, 60_000);

afterAll(async () => t.close());

describe("sign-up trigger", () => {
  it("makes a profile with role user for every new login", async () => {
    const { rows } = await t.pg.query<{ id: string; role: string; full_name: string }>(
      `select id, role, full_name from profiles where id in ('${A}', '${B}')`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.role === "user")).toBe(true);
  });
  it('ignores a role "admin" hidden in the sign-up data', async () => {
    const { rows } = await t.pg.query<{ role: string }>(
      `select role from profiles where id = '${B}'`,
    );
    expect(rows[0].role).toBe("user");
  });
});

describe("a user sees only their own data", () => {
  const requestColumns = "id, tracking_code, user_id";

  it("requests: own only (guest requests and other users are hidden)", async () => {
    const result = await asUser(A, `select ${requestColumns} from requests`);
    expect(result.error).toBeNull();
    expect(result.rows.map((r) => r.user_id)).toEqual([A]);
  });
  it("cannot open another user's request by id", async () => {
    const result = await asUser(A, `select id from requests where id = '${requestB}'`);
    expect(result.rows).toHaveLength(0);
  });
  it("payments: own only", async () => {
    const result = await asUser(A, `select request_id from payments`);
    expect(result.rows.map((r) => r.request_id)).toEqual([requestA]);
  });
  it("request files: own only", async () => {
    const result = await asUser(A, `select request_id from request_files`);
    expect(result.rows.map((r) => r.request_id)).toEqual([requestA]);
  });
  it("status events: own only", async () => {
    await t.pg.exec(
      `insert into request_status_events (request_id, to_status) values ('${requestA}', 'submitted'), ('${requestB}', 'submitted')`,
    );
    const result = await asUser(A, `select request_id from request_status_events`);
    expect(result.rows.map((r) => r.request_id)).toEqual([requestA]);
  });
  it("notes: only the messages for the client, never internal notes", async () => {
    const result = await asUser(A, `select visibility, body from request_notes`);
    expect(result.rows).toEqual([{ visibility: "client", body: "hello client" }]);
  });
  it("profiles: only their own row", async () => {
    const result = await asUser(A, `select id from profiles`);
    expect(result.rows.map((r) => r.id)).toEqual([A]);
  });
  it("cannot read private columns (draft token, storage path, note author)", async () => {
    expect((await asUser(A, `select draft_token_hash from requests`)).error).toMatch(
      /permission denied/i,
    );
    expect((await asUser(A, `select * from requests`)).error).toMatch(/permission denied/i);
    expect((await asUser(A, `select storage_path from request_files`)).error).toMatch(
      /permission denied/i,
    );
    expect((await asUser(A, `select author_id from request_notes`)).error).toMatch(
      /permission denied/i,
    );
  });
  it("cannot read tables meant for admins only", async () => {
    for (const table of ["admin_profiles", "activity_log", "payment_methods", "email_log"]) {
      expect((await asUser(A, `select 1 from ${table}`)).error, table).toMatch(
        /permission denied/i,
      );
    }
  });
});

describe("a user cannot write", () => {
  it("cannot insert, update or delete requests", async () => {
    expect((await asUser(A, `update requests set status = 'completed'`)).error).toMatch(
      /permission denied/i,
    );
    expect((await asUser(A, `delete from requests`)).error).toMatch(/permission denied/i);
    expect(
      (
        await asUser(
          A,
          `insert into requests (tracking_code, service_id, user_id, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at)
           select 'RG-HACKHACK', id, '${A}', 'x', 'zolb-test+h@example.com', '+639000000000', '0000', 'v1', now() from services`,
        )
      ).error,
    ).toMatch(/permission denied/i);
  });
  it("cannot change payments", async () => {
    expect((await asUser(A, `update payments set status = 'verified'`)).error).toMatch(
      /permission denied/i,
    );
  });
});

describe("a user cannot make themselves admin", () => {
  it("lock 1: no update right on the role column", async () => {
    const result = await asUser(A, `update profiles set role = 'admin' where id = '${A}'`);
    expect(result.error).toMatch(/permission denied/i);
  });
  it("lock 2: even with a wide update right, the trigger refuses a role change", async () => {
    // Pretend a mistake gave the role a table-wide update right. The trigger must still stop it.
    await t.pg.exec(`GRANT UPDATE ON public.profiles TO authenticated`);
    try {
      const result = await asUser(A, `update profiles set role = 'admin' where id = '${A}'`);
      expect(result.error).toMatch(/cannot be changed/i);
      const insert = await asUser(
        A,
        `insert into profiles (id, role) values (gen_random_uuid(), 'admin')`,
      );
      expect(insert.error).not.toBeNull();
    } finally {
      await t.pg.exec(`REVOKE UPDATE ON public.profiles FROM authenticated`);
      await t.pg.exec(`GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated`);
    }
  });
  it("can still change their own name and phone", async () => {
    const result = await asUser(
      A,
      `update profiles set full_name = 'New Name', phone = '+639111111111' where id = '${A}'`,
    );
    expect(result.error).toBeNull();
    expect(result.affected).toBe(1);
  });
  it("cannot change another user's profile", async () => {
    const result = await asUser(A, `update profiles set full_name = 'Hacked' where id = '${B}'`);
    expect(result.affected).toBe(0);
  });
  it("the database owner (our server, the SQL editor) can still make an admin", async () => {
    await t.pg.exec(`update profiles set role = 'admin' where id = '${B}'`);
    const { rows } = await t.pg.query<{ role: string }>(
      `select role from profiles where id = '${B}'`,
    );
    expect(rows[0].role).toBe("admin");
    await t.pg.exec(`update profiles set role = 'user' where id = '${B}'`);
  });
});

describe("the anon role", () => {
  it("sees nothing", async () => {
    for (const table of ["requests", "profiles", "payments", "request_files", "services"]) {
      const result = await tryAs("anon", null, `select 1 from ${table}`);
      expect(result.error, table).toMatch(/permission denied/i);
    }
  });
});

describe("an admin", () => {
  it("is_admin() is true only for an active admin_profiles row with role admin", async () => {
    expect((await asUser(ADMIN, `select public.is_admin() as ok`)).rows[0].ok).toBe(true);
    expect((await asUser(IDLE_ADMIN, `select public.is_admin() as ok`)).rows[0].ok).toBe(false);
    expect((await asUser(A, `select public.is_admin() as ok`)).rows[0].ok).toBe(false);
  });
  it("sees all requests, including guest requests, and internal notes", async () => {
    expect((await asUser(ADMIN, `select id from requests`)).rows).toHaveLength(3);
    expect((await asUser(ADMIN, `select id from request_notes`)).rows).toHaveLength(4);
  });
  it("a turned-off admin sees nothing", async () => {
    expect((await asUser(IDLE_ADMIN, `select id from requests`)).rows).toHaveLength(0);
  });
});

describe("storage rule", () => {
  it("lets a user read only files in their own users/{id}/ folder", async () => {
    await t.pg.exec(`
      insert into storage.objects (bucket_id, name) values
        ('client-files', 'users/${A}/requests/${requestA}/one.jpg'),
        ('client-files', 'users/${B}/requests/${requestB}/two.jpg'),
        ('client-files', 'requests/${requestA}/old.jpg'),
        ('public-assets', 'users/${A}/other.png')`);
    const result = await asUser(A, `select name from storage.objects order by name`);
    expect(result.error).toBeNull();
    expect(result.rows.map((r) => r.name)).toEqual([`users/${A}/requests/${requestA}/one.jpg`]);
  });
  it("gives nothing to anon", async () => {
    const result = await tryAs("anon", null, `select name from storage.objects`);
    expect(result.rows).toHaveLength(0);
  });
});
