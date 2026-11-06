import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// Migrations use the DIRECT database URL (port 5432), not the pooled one.
// Schema changes should not go through the transaction pooler.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? "",
  },
  // Show the SQL and ask before running anything risky.
  verbose: true,
  strict: true,
});
