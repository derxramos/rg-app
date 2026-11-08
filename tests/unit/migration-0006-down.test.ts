// Proves docs/rollback/0006_down.sql: after migrations 0000..0006 and the "down" script, the database has the same
// shape as after migration 0005 (columns, triggers, policies, constraints, types, functions), and the accounts
// are mapped back (staff -> staff, admin -> owner, owner -> owner, everyone else -> user).
// Test data uses zolb-test+...@example.com emails only.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FAKE_SUPABASE_SQL } from "../helpers/fake-supabase";

const DRIZZLE = path.resolve(process.cwd(), "drizzle");
const DOWN = path.resolve(process.cwd(), "docs/rollback/0006_down.sql");

async function migrateUpTo(pg: PGlite, lastFile: string) {
  const files = readdirSync(DRIZZLE)
    .filter((f) => f.endsWith(".sql") && f <= lastFile)
    .sort();
  for (const file of files) {
    const statements = readFileSync(path.join(DRIZZLE, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) await pg.exec(statement);
  }
}

async function freshDb(lastFile: string) {
  const pg = new PGlite();
  for (const statement of FAKE_SUPABASE_SQL) await pg.exec(statement);
  await migrateUpTo(pg, lastFile);
  return pg;
}

// A readable summary of the shape of the public schema.
async function shape(pg: PGlite) {
  const q = async (sql: string) =>
    (await pg.query<Record<string, string>>(sql)).rows.map((r) => Object.values(r).join(" | "));
  return {
    columns:
      await q(`select table_name, column_name, udt_name, is_nullable, coalesce(column_default, '')
      from information_schema.columns where table_schema = 'public' order by 1, 2`),
    triggers: await q(`select event_object_table, trigger_name, event_manipulation
      from information_schema.triggers where trigger_schema = 'public' order by 1, 2, 3`),
    policies: await q(
      `select tablename, policyname, cmd, roles::text from pg_policies where schemaname = 'public' order by 1, 2`,
    ),
    constraints:
      await q(`select c.conrelid::regclass::text, c.conname, c.contype, coalesce(c.confrelid::regclass::text, '')
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' order by 1, 2`),
    types:
      await q(`select t.typname, coalesce(string_agg(e.enumlabel, ',' order by e.enumsortorder), '')
      from pg_type t join pg_namespace n on n.oid = t.typnamespace left join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public' and t.typtype = 'e' group by 1 order by 1`),
    functions:
      await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') order by 1`),
    schemas: await q(`select nspname from pg_namespace where nspname in ('private') order by 1`),
  };
}

const ids = {
  owner: "a0000000-0000-4000-8000-0000000000a1",
  admin: "b0000000-0000-4000-8000-0000000000b1",
  staff: "c0000000-0000-4000-8000-0000000000c1",
  offStaff: "c0000000-0000-4000-8000-0000000000c2",
  client: "d0000000-0000-4000-8000-0000000000d1",
  demoted: "d0000000-0000-4000-8000-0000000000d2",
};

let before: Awaited<ReturnType<typeof shape>>;
let after: Awaited<ReturnType<typeof shape>>;
let down: PGlite;

beforeAll(async () => {
  // The shape we must come back to: migrations up to 0005.
  const old = await freshDb("0005_zzzz");
  before = await shape(old);
  await old.close();

  // The new shape, with some accounts, then the down script.
  down = await freshDb("0006_zzzz");
  await down.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ids.owner}', 'zolb-test+owner@example.com', '{"full_name":"Olivia Owner"}'),
      ('${ids.admin}', 'zolb-test+admin@example.com', '{"full_name":"Adam Admin"}'),
      ('${ids.staff}', 'zolb-test+staff@example.com', '{"full_name":"Sam Staff"}'),
      ('${ids.offStaff}', 'zolb-test+off@example.com', '{"full_name":"Off Staff"}'),
      ('${ids.client}', 'zolb-test+client@example.com', '{"full_name":"Carla Client"}'),
      ('${ids.demoted}', 'zolb-test+demoted@example.com', '{"full_name":"Demoted Person"}');
    update profiles set role = 'owner' where id = '${ids.owner}';
    update profiles set role = 'admin' where id = '${ids.admin}';
    update profiles set role = 'staff' where id = '${ids.staff}';
    update profiles set role = 'staff', is_active = false where id = '${ids.offStaff}';
    insert into services (slug, name) values ('svc', 'Service');
    insert into requests (tracking_code, service_id, client_full_name, client_email, client_phone,
      client_phone_last4, consent_version, consent_at)
      select 'RG-DOWNTEST', id, 'Test Client', 'zolb-test+x@example.com', '+639000000000', '0000', 'v1', now() from services;
    -- A note by a person who is a client again now: the old link needs a row for them.
    insert into request_notes (request_id, author_id, visibility, body)
      select r.id, '${ids.demoted}', 'internal', 'old note' from requests r;
  `);
  const sql = readFileSync(DOWN, "utf8");
  await down.exec(sql);
  after = await shape(down);
}, 120_000);
afterAll(async () => down.close());

describe("docs/rollback/0006_down.sql", () => {
  it("gives back the same columns as after migration 0005", () => {
    // The comparison is not empty: it looks at every column of every table.
    expect(before.columns.length).toBeGreaterThan(50);
    expect(before.triggers.length).toBeGreaterThan(10);
    expect(after.columns).toEqual(before.columns);
  });
  it("gives back the same triggers, policies and constraints", () => {
    expect(after.triggers).toEqual(before.triggers);
    expect(after.policies).toEqual(before.policies);
    expect(after.constraints).toEqual(before.constraints);
  });
  it("gives back the same types and functions, and removes the private schema", () => {
    expect(after.types).toEqual(before.types);
    expect(after.functions).toEqual(before.functions);
    expect(after.schemas).toEqual([]);
  });
  it("maps the accounts back: staff -> staff, admin and owner -> owner, a turned-off account stays off", async () => {
    const rows = await down.query<{ id: string; role: string; is_active: boolean }>(
      `select id, role::text, is_active from admin_profiles order by email`,
    );
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));
    expect(byId[ids.owner]).toMatchObject({ role: "owner", is_active: true });
    expect(byId[ids.admin]).toMatchObject({ role: "owner", is_active: true });
    expect(byId[ids.staff]).toMatchObject({ role: "staff", is_active: true });
    expect(byId[ids.offStaff]).toMatchObject({ role: "staff", is_active: false });
    // A client has no admin row, except the person an old note points to (turned off).
    expect(byId[ids.client]).toBeUndefined();
    expect(byId[ids.demoted]).toMatchObject({ role: "staff", is_active: false });
    const profiles = await down.query<{ id: string; role: string }>(
      `select id, role::text from profiles`,
    );
    const roles = Object.fromEntries(profiles.rows.map((r) => [r.id, r.role]));
    expect(roles[ids.owner]).toBe("admin");
    expect(roles[ids.staff]).toBe("admin");
    expect(roles[ids.client]).toBe("user");
  });
  it("the old last-owner rule works again", async () => {
    await expect(
      down.exec(`update admin_profiles set is_active = false where id = '${ids.owner}'`),
    ).resolves.toBeDefined();
    // Two owners (owner and admin->owner): turning off one is fine, turning off the last is not.
    await expect(
      down.exec(`update admin_profiles set is_active = false where id = '${ids.admin}'`),
    ).rejects.toThrow(/at least one active owner/);
  });
  it("keeps the old notes", async () => {
    const notes = await down.query(
      `select 1 from request_notes where author_id = '${ids.demoted}'`,
    );
    expect(notes.rows).toHaveLength(1);
  });
});
