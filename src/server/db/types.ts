import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

// The database type used by all service functions. The real app uses postgres-js (Supabase),
// and the tests use PGlite. Both fit this type, so the same code runs in both places.
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;
