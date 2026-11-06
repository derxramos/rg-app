import { expect, test } from "@playwright/test";

// A basic check that the site starts and the design check page works in development.
test("home page says Hello and shows the header", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Skip to main content/ })).toBeAttached();
});

test("design check page shows all 8 status badges with words", async ({ page }) => {
  await page.goto("/dev/ui");
  for (const label of [
    "Draft",
    "Submitted",
    "Payment submitted",
    "Under review",
    "Waiting for client",
    "In progress",
    "Completed",
    "Cancelled",
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

test("the peso sign is shown", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByText("formatPesos(125000) = ₱1,250.00")).toBeVisible();
});
