import { expect, test, type Page } from "@playwright/test";

import {
  clearStepUpLimits,
  ensureTestAdmin,
  removeTestActivity,
  removeTestAdmin,
  testSql,
} from "./helpers";

// The accounts table (Settings > Admin users): columns, search, filters, rows per page, pagination in the
// web address, the Actions menu and the one confirm. Runs on the LOCAL test database only.
//
// Test accounts (clearly marked, removed again at the end):
//   zolb-test+acc-NN@example.com   13 accounts: clients, staff and ADMIN-role accounts (local database only)
// The signed-in person is the test OWNER from ensureTestAdmin().

test.describe.configure({ mode: "serial" });

const PREFIX = "zolb-test+acc-";
const idFor = (n: number) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;

test.beforeAll(async () => {
  await ensureTestAdmin();
  await clearStepUpLimits();
  await removeTestActivity("77777777-7777-4777-8777-%"); // left over from an earlier run
  const sql = testSql();
  try {
    await sql`delete from profiles where email like ${PREFIX + "%"}`;
    for (let n = 1; n <= 13; n++) {
      // 1-8 clients, 9-10 staff, 11 admin (local test account), 12 turned off, 13 invited with a temporary password
      const role = n <= 8 ? "user" : n <= 10 || n >= 12 ? "staff" : "admin";
      await sql`insert into profiles (id, email, full_name, role, is_active, must_change_password)
                values (${idFor(n)}, ${PREFIX + String(n).padStart(2, "0") + "@example.com"},
                        ${"Table Person " + String(n).padStart(2, "0")}, ${role},
                        ${n !== 12}, ${n === 13})`;
    }
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  const sql = testSql();
  try {
    await sql`delete from profiles where email like ${PREFIX + "%"}`;
  } finally {
    await sql.end();
  }
  // The log rows of this spec point to the test accounts (or were made by the test owner).
  await removeTestActivity("77777777-7777-4777-8777-%");
  await removeTestAdmin();
});

// On a small screen Role and Status are inside the "Filters" panel. Open it first.
async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).locator("visible=true").first();

test("shows the columns, with search, filters and rows per page above", async ({ page }) => {
  await page.goto("/admin/settings/users?per=50");
  await expect(page.getByRole("heading", { level: 1, name: "Admin users" })).toBeVisible();
  await expect(page.getByLabel(/^Search/).first()).toBeVisible();
  await openFilters(page);
  await expect(page.getByLabel("Role", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Status")).toBeVisible();
  // "Rows per page" is only for large screens. A phone always uses 10 rows.
  if (!(await page.getByRole("button", { name: /^Filters/ }).isVisible())) {
    await expect(page.getByLabel("Rows per page")).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
  const headers = page.getByRole("columnheader");
  if (await headers.first().isVisible()) {
    await expect(headers).toHaveText([
      "Account",
      "Role",
      "Status",
      "2-step login",
      "Joined",
      "Actions",
    ]);
  }
  await expect(visible(page, "Table Person 01")).toBeVisible();
});

test("search runs on the server and stays in the web address", async ({ page }) => {
  await page.goto("/admin/settings/users");
  await page.getByLabel(/^Search/).first().fill("Person 07");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=Person\+07|q=Person%2007/);
  await expect(visible(page, "Table Person 07")).toBeVisible();
  await expect(page.getByText("Table Person 08")).toHaveCount(0);
  // The same address in a new load gives the same result.
  await page.reload();
  await expect(visible(page, "Table Person 07")).toBeVisible();
  await page.goto("/admin/settings/users?q=nobody-has-this-name");
  await expect(page.getByText("No accounts found")).toBeVisible();
});

test("filters by role and by status", async ({ page }) => {
  await page.goto("/admin/settings/users?per=50&role=admin");
  await expect(visible(page, "Table Person 11")).toBeVisible();
  await expect(page.getByText("Table Person 01")).toHaveCount(0);
  await page.goto("/admin/settings/users?per=50&status=turned_off");
  await expect(visible(page, "Table Person 12")).toBeVisible();
  await expect(page.getByText("Table Person 11")).toHaveCount(0);
  await page.goto("/admin/settings/users?per=50&status=invited");
  await expect(visible(page, "Table Person 13")).toBeVisible();
  // The select changes the address by itself.
  await page.goto("/admin/settings/users");
  await openFilters(page);
  await page.getByLabel("Role", { exact: true }).selectOption("staff");
  // On a phone the filters wait for the Apply button. On a large screen the select sends the form.
  const apply = page.getByRole("button", { name: "Apply" });
  if (await apply.isVisible()) await apply.click();
  await expect(page).toHaveURL(/role=staff/);
});

test("rows per page and pagination are in the web address", async ({ page }) => {
  await page.goto(`/admin/settings/users?q=${encodeURIComponent("Table Person")}&per=10`);
  await expect(page.getByText(/13 accounts\. Page 1 of 2\./)).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/per=10/);
  await expect(page.getByText(/Page 2 of 2\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous" })).toBeVisible();
  // A page number that is too high shows the last page, not an error.
  await page.goto(`/admin/settings/users?q=${encodeURIComponent("Table Person")}&per=10&page=99`);
  await expect(page.getByText(/Page 2 of 2\./)).toBeVisible();
});

test("your own row has no actions, and the menu has no delete", async ({ page }) => {
  await page.goto(`/admin/settings/users?q=${encodeURIComponent("Table Person 02")}`);
  await page
    .getByRole("button", { name: /Actions for Table Person 02/ })
    .locator("visible=true")
    .first()
    .click();
  await expect(page.getByRole("menuitem", { name: "Change role" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Turn account off/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /delete/i })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto("/admin/settings/users?q=zolb-test%2Bowner");
  await expect(page.getByRole("button", { name: /Actions for Test Owner/ })).toHaveCount(0);
});

test("Change role: one dialog, one confirm with YOUR code, then it is saved and logged", async ({
  page,
}) => {
  await page.goto(`/admin/settings/users?q=${encodeURIComponent("Table Person 03")}`);
  await page
    .getByRole("button", { name: /Actions for Table Person 03/ })
    .locator("visible=true")
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Change role" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Enter the 6-digit code from YOUR authenticator app."),
  ).toBeVisible();
  await dialog.getByLabel("New role").selectOption("staff");
  // Without the code the change is refused.
  await dialog.getByRole("button", { name: "Change role" }).click();
  await expect(dialog.getByText(/fresh 6-digit code/i)).toBeVisible();
  // In development the test code is 000000.
  await dialog.getByLabel(/6-digit code/).fill("000000");
  await dialog.getByRole("button", { name: "Change role" }).click();
  await expect(dialog).toBeHidden();

  const sql = testSql();
  try {
    const [row] = await sql`select role from profiles where id = ${idFor(3)}`;
    expect(row.role).toBe("staff");
    const log =
      await sql`select details from activity_log where action = 'role.changed' and entity_id = ${idFor(3)}`;
    expect(log).toHaveLength(1);
    expect(log[0].details).toMatchObject({ from: "user", to: "staff" });
  } finally {
    await sql.end();
  }
});

// Compares the page with the real width of the screen. If the page is wider, a phone scrolls sideways.
for (const path of [
  "/admin/settings/users?per=50",
  "/admin/requests",
  "/admin/settings/services",
]) {
  test(`no sideways scrolling on ${path}`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.screen.width,
    );
    expect(overflow, "pixels wider than the screen").toBeLessThanOrEqual(0);
  });
}
