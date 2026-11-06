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
  const client = postgres(url, {
    prepare: false,
    // A small pool: serverless functions each run their own copy, and the pooler has a limit.
    max: 3,
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
