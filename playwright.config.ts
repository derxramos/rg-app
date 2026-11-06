import { defineConfig, devices } from "@playwright/test";

// End-to-end tests. Run: pnpm test:e2e
// Needs Google Chrome installed, and the site running with a database (see the README: pnpm dev:db).
export default defineConfig({
  testDir: "./tests/e2e",
  // One test at a time: they share one database, and the local test database allows one connection.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    // Use the Chrome that is already installed. No browser download is needed.
    channel: "chrome",
    trace: "on-first-retry",
  },
  projects: [
    // A phone-sized screen first, because most clients use phones.
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
