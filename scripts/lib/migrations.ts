// Applies the SQL migration files in /drizzle to an in-process Postgres (PGlite).
// Used by the local dev database and by the database tests. Real Supabase uses `pnpm db:migrate`.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

// A migration file is a list of statements separated by this marker.
function statementsOf(file: string): string[] {
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

// `fromFile` (for example "0002") skips the older files. The local dev database uses it to add only the
// migrations it does not have yet.
export async function applyMigrations(db: PGlite, options: { fromFile?: string } = {}) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !options.fromFile || f >= options.fromFile)
    .sort();
  for (const file of files) {
    for (const statement of statementsOf(file)) {
      await db.exec(statement);
    }
  }
}
