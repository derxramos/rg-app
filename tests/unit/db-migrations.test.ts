// Runs the real SQL migrations on an in-memory Postgres (PGlite) and checks the database rules.
// It needs no Supabase account. It proves the triggers and checks work as written.

import { PGlite } from "@electric-sql/pglite";
import { getTableName } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ALL_TABLES } from "@/server/db/schema";

import { applyMigrations } from "../../scripts/lib/migrations";

let db: PGlite;

async function fails(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`Expected this SQL to fail, but it worked: ${sql}`);
}

async function addService() {
  const r = await db.query<{ id: string }>(
    `insert into services (slug, name) values ($1, 'Sample service') returning id`,
    [`sample-${Math.random().toString(36).slice(2)}`],
  );
  return r.rows[0].id;
}

async function addRequest(serviceId: string) {
  const r = await db.query<{ id: string }>(
    `insert into requests
       (tracking_code, service_id, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at)
     values ($1, $2, 'Test Client', 'zolb-test+x@example.com', '+639000000000', '0000', 'v1', now())
     returning id`,
    [`RG-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, serviceId],
  );
  return r.rows[0].id;
}

async function addPaymentMethod() {
  const r = await db.query<{ id: string }>(
    `insert into payment_methods (name, account_name, account_number) values ('Sample', 'Sample Name', '0000') returning id`,
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("migrations", () => {
  it("create every table from the schema file", async () => {
    const result = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const inDb = result.rows.map((r) => r.table_name).sort();
    const inSchema = Object.values(ALL_TABLES)
      .map((t) => getTableName(t))
      .sort();
    expect(inDb).toEqual(inSchema);
  });

  it("turn on Row Level Security for every table, with no policies", async () => {
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rls.rows.length).toBe(Object.keys(ALL_TABLES).length);
    for (const row of rls.rows) {
      expect(row.relrowsecurity, `RLS is off for ${row.relname}`).toBe(true);
    }
    const policies = await db.query(`select 1 from pg_policies where schemaname = 'public'`);
    expect(policies.rows).toHaveLength(0);
  });
});

describe("activity_log is append-only", () => {
  it("allows inserts but blocks update, delete and truncate", async () => {
    await db.query(
      `insert into activity_log (actor_type, action, entity_type) values ('system', 'test.action', 'test')`,
    );
    expect(await fails(`update activity_log set action = 'changed'`)).toMatch(/append-only/);
    expect(await fails(`delete from activity_log`)).toMatch(/append-only/);
    expect(await fails(`truncate activity_log`)).toMatch(/append-only/);
  });

  it("lets the purge function remove only rows older than 1 year", async () => {
    // Insert old rows by turning the trigger off for this one setup step.
    await db.exec(`alter table activity_log disable trigger activity_log_no_update_delete`);
    await db.query(
      `insert into activity_log (actor_type, action, entity_type, created_at)
       values ('system', 'old.action', 'test', now() - interval '2 years')`,
    );
    await db.exec(`alter table activity_log enable trigger activity_log_no_update_delete`);

    const before = await db.query<{ n: number }>(`select count(*)::int as n from activity_log`);
    const purged = await db.query<{ purge_old_activity_log: string | number }>(
      `select public.purge_old_activity_log()`,
    );
    expect(Number(purged.rows[0].purge_old_activity_log)).toBe(1);

    const after = await db.query<{ n: number }>(`select count(*)::int as n from activity_log`);
    expect(after.rows[0].n).toBe(before.rows[0].n - 1);
    // The rows from the last year are still there, and the table is still locked.
    expect(await fails(`delete from activity_log`)).toMatch(/append-only/);
  });
});

describe("payment_methods changes are logged", () => {
  it("writes before and after values for insert, update and delete", async () => {
    const insert = await db.query<{ id: string }>(
      `insert into payment_methods (name, account_name, account_number)
       values ('Log test', 'Name One', '1111') returning id`,
    );
    const id = insert.rows[0].id;
    await db.query(`update payment_methods set account_number = '2222' where id = $1`, [id]);
    await db.query(`delete from payment_methods where id = $1`, [id]);

    const log = await db.query<{
      details: {
        operation: string;
        before: { account_number?: string } | null;
        after: { account_number?: string } | null;
      };
    }>(
      `select details from activity_log
       where action = 'payment_method.row_changed' and entity_id = $1 order by id`,
      [id],
    );
    expect(log.rows.map((r) => r.details.operation)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(log.rows[0].details.before).toBeNull();
    expect(log.rows[1].details.before?.account_number).toBe("1111");
    expect(log.rows[1].details.after?.account_number).toBe("2222");
    expect(log.rows[2].details.after).toBeNull();
  });

  it("records who made the change when the app sets app.actor_id", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    await db.exec(`select set_config('app.actor_id', '${actor}', false)`);
    const insert = await db.query<{ id: string }>(
      `insert into payment_methods (name, account_name, account_number) values ('Actor test', 'N', '3') returning id`,
    );
    await db.exec(`select set_config('app.actor_id', '', false)`);

    const log = await db.query<{ actor_type: string; actor_id: string }>(
      `select actor_type, actor_id from activity_log where entity_id = $1`,
      [insert.rows[0].id],
    );
    expect(log.rows[0].actor_type).toBe("admin");
    expect(log.rows[0].actor_id).toBe(actor);
  });

  it("does not log an update that changes nothing", async () => {
    const id = await addPaymentMethod();
    await db.query(`update payment_methods set name = name where id = $1`, [id]);
    const log = await db.query<{ details: { operation: string } }>(
      `select details from activity_log where entity_id = $1`,
      [id],
    );
    // Only the INSERT row. The no-change update adds nothing.
    expect(log.rows.map((r) => r.details.operation)).toEqual(["INSERT"]);
  });
});

describe("admin_profiles keeps at least one active owner", () => {
  const owner1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const owner2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("blocks removing, demoting or turning off the last active owner", async () => {
    await db.query(
      `insert into admin_profiles (id, full_name, email, role) values ($1, 'Owner One', 'zolb-test+o1@example.com', 'owner')`,
      [owner1],
    );
    expect(await fails(`delete from admin_profiles where id = $1`, [owner1])).toMatch(
      /at least one active owner/,
    );
    expect(await fails(`update admin_profiles set role = 'staff' where id = $1`, [owner1])).toMatch(
      /at least one active owner/,
    );
    expect(
      await fails(`update admin_profiles set is_active = false where id = $1`, [owner1]),
    ).toMatch(/at least one active owner/);
  });

  it("allows it when another active owner exists, and still protects the new last one", async () => {
    await db.query(
      `insert into admin_profiles (id, full_name, email, role) values ($1, 'Owner Two', 'zolb-test+o2@example.com', 'owner')`,
      [owner2],
    );
    await db.query(`update admin_profiles set is_active = false where id = $1`, [owner1]);
    expect(await fails(`update admin_profiles set role = 'staff' where id = $1`, [owner2])).toMatch(
      /at least one active owner/,
    );
  });

  it("lets staff accounts be changed freely", async () => {
    const staff = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await db.query(
      `insert into admin_profiles (id, full_name, email, role) values ($1, 'Staff', 'zolb-test+s@example.com', 'staff')`,
      [staff],
    );
    await db.query(`update admin_profiles set is_active = false where id = $1`, [staff]);
    await db.query(`delete from admin_profiles where id = $1`, [staff]);
  });
});

describe("payments rules", () => {
  async function addPayment(
    requestId: string,
    methodId: string,
    reference: string,
    amount = 125000,
  ) {
    return db.query(
      `insert into payments
         (request_id, payment_method_id, method_snapshot, reference_number, amount_centavos, paid_on, entry_method)
       values ($1, $2, '{}'::jsonb, $3, $4, '2026-11-06', 'manual')`,
      [requestId, methodId, reference, amount],
    );
  }

  it("rejects the same reference number twice for one payment method", async () => {
    const requestId = await addRequest(await addService());
    const methodId = await addPaymentMethod();
    await addPayment(requestId, methodId, "REF123456");
    expect(
      await fails(
        `insert into payments (request_id, payment_method_id, method_snapshot, reference_number, amount_centavos, paid_on, entry_method)
       values ($1, $2, '{}'::jsonb, 'REF123456', 100, '2026-11-06', 'manual')`,
        [requestId, methodId],
      ),
    ).toMatch(/payments_method_reference_unique|duplicate/);
  });

  it("allows the same reference number on a different payment method", async () => {
    const requestId = await addRequest(await addService());
    const m1 = await addPaymentMethod();
    const m2 = await addPaymentMethod();
    await addPayment(requestId, m1, "SAMEREF999");
    await addPayment(requestId, m2, "SAMEREF999");
  });

  it("rejects zero or negative amounts", async () => {
    const requestId = await addRequest(await addService());
    const methodId = await addPaymentMethod();
    expect(
      await fails(
        `insert into payments (request_id, payment_method_id, method_snapshot, reference_number, amount_centavos, paid_on, entry_method)
       values ($1, $2, '{}'::jsonb, 'ZERO000001', 0, '2026-11-06', 'manual')`,
        [requestId, methodId],
      ),
    ).toMatch(/payments_amount_positive/);
  });

  it("rejects reference numbers with spaces or symbols", async () => {
    const requestId = await addRequest(await addService());
    const methodId = await addPaymentMethod();
    expect(
      await fails(
        `insert into payments (request_id, payment_method_id, method_snapshot, reference_number, amount_centavos, paid_on, entry_method)
       values ($1, $2, '{}'::jsonb, 'BAD REF 1', 100, '2026-11-06', 'manual')`,
        [requestId, methodId],
      ),
    ).toMatch(/payments_reference_format/);
  });

  it("keeps money as whole centavos in a bigint column", async () => {
    const result = await db.query<{ data_type: string }>(
      `select data_type from information_schema.columns where table_name = 'payments' and column_name = 'amount_centavos'`,
    );
    expect(result.rows[0].data_type).toBe("bigint");
  });
});

describe("requests rules", () => {
  it("starts as draft and refreshes updated_at on every update", async () => {
    const id = await addRequest(await addService());
    const first = await db.query<{ status: string; updated_at: Date }>(
      `select status, updated_at from requests where id = $1`,
      [id],
    );
    expect(first.rows[0].status).toBe("draft");

    await db.query(`update requests set updated_at = now() - interval '1 day' where id = $1`, [id]);
    await db.query(`update requests set business_name = 'Changed' where id = $1`, [id]);
    const second = await db.query<{ fresh: boolean }>(
      `select updated_at > now() - interval '1 minute' as fresh from requests where id = $1`,
      [id],
    );
    expect(second.rows[0].fresh).toBe(true);
  });

  it("rejects a tracking code that is used twice", async () => {
    const serviceId = await addService();
    await db.query(
      `insert into requests (tracking_code, service_id, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at)
       values ('RG-DUPLICATE', $1, 'A', 'zolb-test+a@example.com', '+639000000001', '0001', 'v1', now())`,
      [serviceId],
    );
    expect(
      await fails(
        `insert into requests (tracking_code, service_id, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at)
       values ('RG-DUPLICATE', $1, 'B', 'zolb-test+b@example.com', '+639000000002', '0002', 'v1', now())`,
        [serviceId],
      ),
    ).toMatch(/duplicate|unique/);
  });

  it("rejects a last-4 value that is not 4 digits", async () => {
    const serviceId = await addService();
    expect(
      await fails(
        `insert into requests (tracking_code, service_id, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at)
       values ('RG-BADLAST4', $1, 'A', 'zolb-test+c@example.com', '+639000000003', '12ab', 'v1', now())`,
        [serviceId],
      ),
    ).toMatch(/requests_phone_last4_digits/);
  });

  it("does not allow deleting a service that has requests", async () => {
    const serviceId = await addService();
    await addRequest(serviceId);
    expect(await fails(`delete from services where id = $1`, [serviceId])).toMatch(
      /foreign key|violates/,
    );
  });

  it("removes a service's checklist when the service is deleted", async () => {
    const serviceId = await addService();
    await db.query(`insert into service_requirements (service_id, label) values ($1, 'Item')`, [
      serviceId,
    ]);
    await db.query(`delete from services where id = $1`, [serviceId]);
    const left = await db.query(`select 1 from service_requirements where service_id = $1`, [
      serviceId,
    ]);
    expect(left.rows).toHaveLength(0);
  });
});

describe("rate_limits", () => {
  it("counts up with one atomic upsert", async () => {
    const sql = `insert into rate_limits (key, window_start, count) values ('test:key', '2026-11-06T00:00:00Z', 1)
                 on conflict (key, window_start) do update set count = rate_limits.count + 1 returning count`;
    await db.query(sql);
    await db.query(sql);
    const third = await db.query<{ count: number }>(sql);
    expect(third.rows[0].count).toBe(3);
  });
});
