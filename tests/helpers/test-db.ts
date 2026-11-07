// A fresh in-memory Postgres (PGlite) with all migrations, for service tests.
// Pass { supabase: true } to also get a tiny fake of Supabase (auth schema, anon/authenticated roles,
// storage schema) BEFORE the migrations run. Only the database-rule tests need that.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/server/db/schema";

import { applyMigrations } from "../../scripts/lib/migrations";

import { FAKE_SUPABASE_SQL } from "./fake-supabase";

export async function createTestDb(options: { supabase?: boolean } = {}) {
  const pg = new PGlite();
  if (options.supabase) {
    for (const statement of FAKE_SUPABASE_SQL) await pg.exec(statement);
  }
  await applyMigrations(pg);
  const db = drizzle(pg, { schema });
  return { pg, db, close: () => pg.close() };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
