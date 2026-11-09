import { expect, test } from "@playwright/test";

import {
  cleanTestData,
  clearStepUpLimits,
  createPaidRequest,
  ensureTestAdmin,
  ensureTestService,
  removeTestActivity,
  removeTestAdmin,
  testSql,
} from "./helpers";

// The payment methods list (Settings > Payment methods): delete one from the Actions menu, delete several with
// the checkboxes, and a method that payments used is kept and named. Runs on the LOCAL test database only.
//
// Test data (clearly marked, removed again at the end): the methods "Test list A/B/C (e2e)" and the usual test
// payment method "Test GCash (e2e)", which one test payment uses. The signed-in person is the test OWNER.

test.describe.configure({ mode: "serial" });

const NAMES = ["Test list A (e2e)", "Test list B (e2e)", "Test list C (e2e)"];

async function exists(name: string): Promise<boolean> {
  const sql = testSql();
  try {
    const rows = await sql`select 1 from payment_methods where name = ${name}`;
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}

test.beforeAll(async () => {
  await ensureTestService();
  await ensureTestAdmin();
  await clearStepUpLimits();
  await createPaidRequest("Payment List Client"); // a payment that uses "Test GCash (e2e)"
  const sql = testSql();
  try {
    await sql`delete from payment_methods where name like 'Test list %'`;
    for (const [i, name] of NAMES.entries()) {
      await sql`insert into payment_methods (name, parser_key, account_name, account_number, instructions, qr_image_path, is_active, sort_order)
                values (${name}, 'gcash', 'SAMPLE - not real', '0000 000 0000', 'Only for automatic tests.', 'samples/sample-qr.svg', true, ${50 + i})`;
    }
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  const sql = testSql();
  try {
    await sql`delete from payment_methods where name like 'Test list %'`;
  } finally {
    await sql.end();
  }
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

test("delete one method from its Actions menu, after the confirm and the code", async ({
  page,
}) => {
  await page.goto("/admin/settings/payments");
  await expect(page.getByRole("link", { name: NAMES[0] })).toBeVisible();

  await page.getByRole("button", { name: `Actions for ${NAMES[0]}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delete this payment method")).toBeVisible();
  await expect(dialog.getByText(NAMES[0])).toBeVisible();
  // Without the code nothing is deleted.
  await dialog.getByRole("button", { name: "Delete the payment method" }).click();
  await expect(dialog.getByText(/6-digit code/i).first()).toBeVisible();
  expect(await exists(NAMES[0])).toBe(true);

  // In development the test code is 000000.
  await dialog.getByLabel(/6-digit code/).fill("000000");
  await dialog.getByRole("button", { name: "Delete the payment method" }).click();
  // The page behind a dialog is hidden from the checks, so wait until the dialog has closed.
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: NAMES[0] })).toHaveCount(0);
  expect(await exists(NAMES[0])).toBe(false);
  // The other methods are still there.
  await expect(page.getByRole("link", { name: NAMES[1] })).toBeVisible();
});

test("delete several with the checkboxes; a method that payments used is kept", async ({
  page,
}) => {
  await page.goto("/admin/settings/payments");
  await expect(page.getByRole("link", { name: NAMES[1] })).toBeVisible();

  await page.getByRole("checkbox", { name: `Select ${NAMES[1]}` }).check();
  await page.getByRole("checkbox", { name: `Select ${NAMES[2]}` }).check();
  await page.getByRole("checkbox", { name: "Select Test GCash (e2e)" }).check();
  await expect(page.getByText("3 methods selected")).toBeVisible();

  await page.getByRole("button", { name: "Delete selected" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delete 3 payment methods")).toBeVisible();
  // The dialog says in advance which one will be kept.
  await expect(dialog.getByText(/used by 1 payment: will be kept/)).toBeVisible();

  await dialog.getByLabel(/6-digit code/).fill("000000");
  await dialog.getByRole("button", { name: "Delete the payment methods" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("link", { name: NAMES[1] })).toHaveCount(0);
  await expect(page.getByRole("link", { name: NAMES[2] })).toHaveCount(0);
  expect(await exists(NAMES[1])).toBe(false);
  expect(await exists(NAMES[2])).toBe(false);
  // The used one is still there, and the screen said so.
  await expect(page.getByRole("link", { name: "Test GCash (e2e)" })).toBeVisible();
  expect(await exists("Test GCash (e2e)")).toBe(true);
  await expect(page.getByText(/Not deleted \(payments used them/)).toBeVisible();
});

test("Select all ticks every method, and Clear removes the ticks", async ({ page }) => {
  await page.goto("/admin/settings/payments");
  await expect(page.getByRole("link", { name: "Test GCash (e2e)" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select all payment methods" }).check();
  await expect(page.getByRole("status").filter({ hasText: "selected" })).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("status").filter({ hasText: "selected" })).toHaveCount(0);
  // Turn off / on stays a visible button on the card.
  await expect(page.getByRole("button", { name: /Turn (off|on)/ }).first()).toBeVisible();
});
