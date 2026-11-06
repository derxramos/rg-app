// Daily cleanup job. Run by GitHub Actions (.github/workflows/scheduled-jobs.yml), or by hand: pnpm job:cleanup
// It talks to Supabase directly, so it does not use any hosting limits (docs/ARCHITECTURE.md section 9).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import { runCleanup } from "../src/server/jobs/cleanup-core";
import { createSupabaseStorage } from "../src/server/storage/supabase-driver";
import { loadEnv, requireEnv } from "./lib/env";

loadEnv();

async function main() {
  const url = process.env.DIRECT_DATABASE_URL?.trim() || requireEnv("DATABASE_URL");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  try {
    const storage = createSupabaseStorage(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SECRET_KEY"),
    );
    const summary = await runCleanup(db, storage, {
      clientFilesBucket: process.env.SUPABASE_BUCKET_CLIENT_FILES?.trim() || "client-files",
    });
    console.log("Cleanup finished:", JSON.stringify(summary));
    // A non-zero exit makes the GitHub Action fail, and GitHub emails the owner about it.
    if (summary.errors > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
