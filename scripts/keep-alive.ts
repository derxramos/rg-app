// Keep-alive job. The free Supabase project pauses after 7 days with no activity. This tiny query every
// 3 days prevents it. Run by GitHub Actions, or by hand: pnpm job:keep-alive
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import { runKeepAlive } from "../src/server/jobs/cleanup-core";
import { loadEnv, requireEnv } from "./lib/env";

loadEnv();

async function main() {
  const url = process.env.DIRECT_DATABASE_URL?.trim() || requireEnv("DATABASE_URL");
  const client = postgres(url, { max: 1, prepare: false });
  try {
    await runKeepAlive(drizzle(client, { schema }));
    console.log("Keep-alive done.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
