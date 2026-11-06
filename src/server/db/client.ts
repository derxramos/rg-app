import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// Dev mode reloads modules often. We keep one connection pool on globalThis so reloads do not open new pools.
const globalForDb = globalThis as unknown as { __rgDb?: Db };

// Connects with the pooled "transaction" URL (port 6543).
// The pooler in transaction mode does not support prepared statements, so `prepare: false` is required.
// This connection bypasses RLS, so every caller must check access before it reads or writes.
function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  // Supabase's direct address (db.<id>.supabase.co) only works over IPv6, which Vercel cannot use.
  // Say so clearly, instead of showing a confusing ENETUNREACH error.
  if (process.env.NODE_ENV === "production" && /@db\.[a-z0-9]+\.supabase\.co/i.test(url)) {
    throw new Error(
      "DATABASE_URL is the Supabase DIRECT address. Use the Transaction pooler address instead (host has pooler.supabase.com, port 6543). See docs/SETUP_GUIDE.md.",
    );
  }
  const client = postgres(url, {
    prepare: false,
    // A small pool: serverless functions each run their own copy, and the pooler has a limit.
    // 3 by default. DB_POOL_MAX=1 is for the local test database, which allows one query at a time.
    max: Number(process.env.DB_POOL_MAX) || 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
}

// The database is opened the first time it is needed, not when the file is imported.
// This lets `next build` run without a database.
export function getDb(): Db {
  globalForDb.__rgDb ??= createDb();
  return globalForDb.__rgDb;
}
