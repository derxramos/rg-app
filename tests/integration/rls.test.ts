// Proves the public Supabase key cannot read or write any table.
// This test talks to a REAL Supabase project, so it only runs when the keys are in .env.local.
// Run: pnpm test:integration   (run `pnpm db:migrate` and `pnpm db:seed` first)

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getTableName } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { ALL_TABLES } from "@/server/db/schema";

config({ path: ".env.local", quiet: true });

const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const hasEnv = Boolean(dbUrl && supabaseUrl && publicKey);

const tableNames = Object.values(ALL_TABLES).map((t) => getTableName(t));

describe.skipIf(!hasEnv)("Supabase public key is locked out of every table", () => {
  const sql = postgres(dbUrl ?? "", { max: 1, prepare: false });
  // The same kind of client the browser would use: the public key, no login.
  const anon = createClient(supabaseUrl ?? "http://localhost", publicKey ?? "none", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  afterAll(async () => {
    await sql.end();
  });

  it("has Row Level Security on for every table and no policies", async () => {
    const rows = await sql`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`;
    const dbTables = rows.map((r) => r.relname as string).sort();
    expect(dbTables).toEqual([...tableNames].sort());
    for (const row of rows) {
      expect(row.relrowsecurity, `RLS is off for ${row.relname}`).toBe(true);
    }
    const policies = await sql`select policyname from pg_policies where schemaname = 'public'`;
    expect(policies).toHaveLength(0);
  });

  it("has real data to protect (so an empty result means something)", async () => {
    const [row] = await sql`select count(*)::int as n from site_settings`;
    expect(row.n, "site_settings is empty. Run `pnpm db:seed` first.").toBeGreaterThan(0);
  });

  it.each(tableNames)("cannot read any row from %s", async (table) => {
    const { data, error } = await anon.from(table).select("*").limit(1);
    // Either the request is refused (error) or it succeeds with no rows. Never any rows.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot write to a table", async () => {
    await anon.from("site_settings").insert({ key: "rls_test_should_not_exist", value: {} });
    await anon.from("site_settings").update({ value: {} }).eq("key", "contact");
    await anon.from("site_settings").delete().eq("key", "contact");

    const rows = await sql`select key from site_settings where key = 'rls_test_should_not_exist'`;
    expect(rows).toHaveLength(0);
    const contact = await sql`select key from site_settings where key = 'contact'`;
    expect(contact).toHaveLength(1);
  });
});

describe.skipIf(hasEnv)("Supabase public key test", () => {
  it.skip("is skipped: set DIRECT_DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local", () => {});
});
