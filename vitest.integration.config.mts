import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests that need a real Supabase project. Run with: pnpm test:integration
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
