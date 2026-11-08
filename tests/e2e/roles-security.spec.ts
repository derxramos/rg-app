import { expect, test } from "@playwright/test";

import {
  clearStepUpLimits,
  ensureTestAdmin,
  removeTestActivity,
  removeTestAdmin,
  testSql,
} from "./helpers";

// The Security page and the Reset 2-step login dialog. They run on the LOCAL test database, which has no Supabase,
// so the real device changes are covered by unit tests (tests/unit/mfa-devices.test.ts, accounts-reset.test.ts).
// Here we check what the screens show and that the confirm rules work in the browser.
//
// Test account: zolb-test+sec-01@example.com with the role STAFF (local database only).

test.describe.configure({ mode: "serial" });

const STAFF_ID = "55555555-5555-4555-8555-000000000001";
const STAFF_EMAIL = "zolb-test+sec-01@example.com";

test.beforeAll(async () => {
  await ensureTestAdmin();
  await clearStepUpLimits();
  await removeTestActivity("55555555-5555-4555-8555-%");
  const sql = testSql();
  try {
    await sql`delete from profiles where email = ${STAFF_EMAIL}`;
    await sql`insert into profiles (id, email, full_name, role) values (${STAFF_ID}, ${STAFF_EMAIL}, 'Security Test Staff', 'staff')`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  const sql = testSql();
  try {
    await sql`delete from profiles where email = ${STAFF_EMAIL}`;
  } finally {
    await sql.end();
  }
  await removeTestActivity("55555555-5555-4555-8555-%");
  await removeTestAdmin();
});

test("the header has a Security link, and the page opens", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("link", { name: /Security: my authenticator devices/ }).click();
  await expect(page).toHaveURL(/\/admin\/security/);
  await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
  // This copy runs without Supabase, so it says so instead of showing devices.
  await expect(page.getByText("Not available here")).toBeVisible();
});

test("Reset 2-step login asks for the confirm and for the full email, and refuses a wrong email", async ({
  page,
}) => {
  await page.goto(`/admin/settings/users?q=${encodeURIComponent(STAFF_EMAIL)}`);
  await page
    .getByRole("button", { name: /Actions for Security Test Staff/ })
    .locator("visible=true")
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Reset 2-step login" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/lost their phone/)).toBeVisible();
  await expect(dialog.getByText(/authenticator AND a backup device/)).toBeVisible();
  await expect(
    dialog.getByText("Enter the 6-digit code from YOUR authenticator app."),
  ).toBeVisible();
  await dialog.getByLabel(/6-digit code/).fill("000000");
  await dialog.getByLabel(/To confirm, type the email/).fill("someone-else@example.com");
  await dialog.getByRole("button", { name: "Reset 2-step login" }).click();
  await expect(dialog.getByText("Type the full email of the person to confirm.")).toBeVisible();

  // Nothing was changed.
  const sql = testSql();
  try {
    const [row] = await sql`select mfa_reset_required from profiles where id = ${STAFF_ID}`;
    expect(row.mfa_reset_required).toBe(false);
    const log =
      await sql`select 1 from activity_log where action = 'account.2fa_reset' and entity_id = ${STAFF_ID}`;
    expect(log).toHaveLength(0);
  } finally {
    await sql.end();
  }
});

test("the admin header still fits the screen with the Security link", async ({ page }) => {
  await page.goto("/admin/security");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.screen.width,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
