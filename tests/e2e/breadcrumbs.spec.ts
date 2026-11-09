import { expect, test } from "@playwright/test";

import {
  cleanTestData,
  createPaidRequest,
  ensureTestAdmin,
  ensureTestService,
  removeTestActivity,
  removeTestAdmin,
} from "./helpers";

// Breadcrumbs (and the "Back to ..." link on a phone) on the admin pages that are two or more levels deep.
// Runs on the LOCAL test database only. The signed-in person is the test OWNER.

test.describe.configure({ mode: "serial" });

let requestId = "";

test.beforeAll(async () => {
  await ensureTestService();
  await ensureTestAdmin();
  const paid = await createPaidRequest("Crumb Client");
  requestId = paid.requestId;
});

test.afterAll(async () => {
  await cleanTestData();
  await removeTestActivity();
  await removeTestAdmin();
});

test.beforeEach(async ({ page }) => {
  // The development proxy only lets a request through when the dev cookie exists. A value that is not a test
  // email is ignored by the session code, so the dev admin bypass (the test owner) applies.
  await page
    .context()
    .addCookies([{ name: "rg_dev_user", value: "admin-bypass", url: "http://localhost:3000" }]);
});

// On a desktop the trail is a list of links. On a phone it is one "Back to ..." link. Both are in the same
// navigation, so a test can find the link by its words.
const crumbs = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Breadcrumb" });

test("Settings > Payment methods > one method, and back to the list in one click", async ({
  page,
}) => {
  await page.goto("/admin/settings/payments");
  await expect(page.getByRole("heading", { level: 1, name: "Payment methods" })).toBeVisible();
  await page.getByRole("link", { name: "Test GCash (e2e)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Edit Test GCash/ })).toBeVisible();

  const trail = crumbs(page);
  await expect(trail).toBeVisible();
  // The whole trail is on a wide screen. A phone has only the way back.
  const wide = (page.viewportSize()?.width ?? 0) >= 640;
  if (wide) {
    await expect(trail.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/admin/settings",
    );
    await expect(trail.locator('[aria-current="page"]')).toHaveText(/Edit Test GCash|Test GCash/);
  }
  await trail.getByRole("link", { name: /Payment methods/ }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/payments$/);
  await expect(page.getByRole("heading", { level: 1, name: "Payment methods" })).toBeVisible();
});

test("a request goes back to the same search and page of the Requests list", async ({ page }) => {
  await page.goto("/admin/requests?q=Crumb&status=payment_submitted");
  await expect(page.getByRole("link", { name: /^RG-/ }).first()).toBeVisible();
  // The table (wide) and the cards (phone) both link to the request.
  await page
    .getByRole("link", { name: /^RG-|Crumb Client/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/requests/${requestId}`));

  await crumbs(page)
    .getByRole("link", { name: /Requests/ })
    .click();
  await expect(page).toHaveURL(/\/admin\/requests\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("q")).toBe("Crumb");
  expect(url.searchParams.get("status")).toBe("payment_submitted");
});

test("a request opened from the Dashboard goes back to the Dashboard", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Needs action" })).toBeVisible();
  await page
    .getByRole("link", { name: /Crumb Client/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/requests/${requestId}\\?from=dashboard`));
  await crumbs(page)
    .getByRole("link", { name: /Dashboard/ })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("a made-up list address in the link cannot add words to the way back", async ({ page }) => {
  await page.goto(
    `/admin/requests/${requestId}?list=${encodeURIComponent("q=a&next=https://evil.example")}`,
  );
  const link = crumbs(page).getByRole("link", { name: /Requests/ });
  await expect(link).toHaveAttribute("href", "/admin/requests?q=a");
});

test("top-level pages have no trail", async ({ page }) => {
  for (const path of ["/admin", "/admin/requests", "/admin/settings", "/admin/activity"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(crumbs(page)).toHaveCount(0);
  }
});
