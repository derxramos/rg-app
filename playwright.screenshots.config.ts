import { defineConfig } from "@playwright/test";

// Makes the pictures for the case study page (public/case-study/*.jpg) from the running app, with FAKE data.
// Run: pnpm screenshots   (needs Google Chrome and the local test database: pnpm dev:db)
// It is not part of the normal tests.
export default defineConfig({
  testDir: "./tests/screenshots",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3000", channel: "chrome" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
