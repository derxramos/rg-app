// A fresh in-memory Postgres (PGlite) with all migrations, for service tests.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/server/db/schema";

import { applyMigrations } from "../../scripts/lib/migrations";

export async function createTestDb() {
  const pg = new PGlite();
  await applyMigrations(pg);
  const db = drizzle(pg, { schema });
  return { pg, db, close: () => pg.close() };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
