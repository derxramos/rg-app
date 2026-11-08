// Admin 2-step login in the browser, for whichever value ADMIN_REQUIRE_2FA has when the site was started.
// Run it twice: once with ADMIN_REQUIRE_2FA=false and once with ADMIN_REQUIRE_2FA=true (see docs/AUTH_AND_ROLES.md).
// It uses the development admin and test users, so no Supabase account is needed.
import { expect, test } from "@playwright/test";

import { isTwoFactorRequired } from "../../src/lib/two-factor-flag";

import {
  E2E_METHOD_ID,
  ensureTestAdmin,
  ensureTestService,
  removeTestAdmin,
  removeTestProfiles,
  signInAsTestUser,
} from "./helpers";

// The site reads the same variable (shell first, then .env.local), and so does this test process.
const required = isTwoFactorRequired(process.env.ADMIN_REQUIRE_2FA);
const BANNER = "2-step login is OFF. Turn it on before real clients use this site.";

test.beforeAll(async () => {
  await ensureTestService();
  await ensureTestAdmin();
});
test.afterAll(async () => {
  await removeTestAdmin();
  await removeTestProfiles();
});

test(`the red banner is ${required ? "NOT shown (2FA is required)" : "shown on admin pages (2FA is off)"}`, async ({
  page,
}) => {
  await page.goto("/api/dev-login?as=admin&next=/admin");
  await expect(page.getByRole("heading", { level: 1, name: /Hello, Test/ })).toBeVisible();
  for (const path of ["/admin", "/admin/requests", "/admin/settings/payments"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByText(BANNER)).toHaveCount(required ? 0 : 1);
  }
});

test("a risky change always asks for the confirm of the person doing it (the flag does not remove it)", async ({
  page,
}) => {
  await page.goto("/api/dev-login?as=admin&next=/");
  await page.goto(`/admin/settings/payments/${E2E_METHOD_ID}`);
  // With the flag off the confirm is still asked (code, or the password when there is no authenticator).
  await expect(page.getByLabel(/6-digit code/)).toHaveCount(1);
});

test("the 2FA pages never help a normal user", async ({ page }) => {
  await signInAsTestUser(page);
  for (const path of ["/admin/mfa", "/admin/mfa/setup"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\/not-allowed/);
  }
});

test("a visitor at the 2FA pages is sent to sign in", async ({ page }) => {
  await page.goto("/api/dev-login?logout=1&next=/");
  await page.goto("/admin/mfa");
  await expect(page).toHaveURL(/\/login/);
});

test("a normal user is never asked for a code, and never sees the banner", async ({ page }) => {
  await signInAsTestUser(page);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "My Requests" })).toBeVisible();
  await expect(page.getByText(BANNER)).toHaveCount(0);
  await expect(page.getByLabel(/6-digit code/)).toHaveCount(0);
});
