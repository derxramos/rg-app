// A local test database for development. It needs no Supabase account and no Docker.
// Run: pnpm dev:db        (keep it running in its own terminal)
// Then put this in .env.local:
//   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres
//   DIRECT_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres
//   DB_POOL_MAX=1
// Data is saved in the .pglite folder (not in git). Delete that folder to start fresh.
//
// This is real Postgres running inside Node (PGlite), so it is good for looking at pages,
// but it is NOT Supabase. Always run the real checks on Supabase too (see PROGRESS.md).
//
// Limit: PGlite runs on ONE connection. Several programs at the same time (for example the
// parallel workers of `pnpm build`) can clash and show "ECONNRESET" or "bind message" errors.
// If that happens, run the command again. Real Postgres (Supabase) does not have this limit.

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { DEFAULT_SETTINGS, SETTING_KEYS } from "../src/lib/validation/settings";
import { applyMigrations } from "./lib/migrations";

const PORT = 54329;

async function main() {
  const db = new PGlite("./.pglite");

  const check = await db.query<{ exists: boolean }>(
    `select to_regclass('public.site_settings') is not null as exists`,
  );
  if (!check.rows[0].exists) {
    console.log("First run: applying migrations...");
    await applyMigrations(db);
    for (const key of SETTING_KEYS) {
      await db.query(
        `insert into site_settings (key, value) values ($1, $2::jsonb) on conflict do nothing`,
        [key, JSON.stringify(DEFAULT_SETTINGS[key])],
      );
    }
    console.log("Default settings added.");
  }

  // An older local database (made before accounts existed) gets the newer migrations once.
  const hasProfiles = await db.query<{ exists: boolean }>(
    `select to_regclass('public.profiles') is not null as exists`,
  );
  if (!hasProfiles.rows[0].exists) {
    console.log("Adding the accounts migrations (0002 and later)...");
    await applyMigrations(db, { fromFile: "0002" });
  }

  // A local database made before the single role column (migration 0006) gets it once.
  const hasAccountRole = await db.query<{ exists: boolean }>(
    `select to_regtype('public.account_role') is not null as exists`,
  );
  if (!hasAccountRole.rows[0].exists) {
    console.log("Adding the roles migration (0006 and later)...");
    await applyMigrations(db, { fromFile: "0006" });
  }

  const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 3 });
  await server.start();
  console.log(`Local database is ready on postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
  console.log("Press Ctrl+C to stop.");

  process.on("SIGINT", async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
