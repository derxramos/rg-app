import { expect, test } from "@playwright/test";

import {
  clearStepUpLimits,
  ensureTestAdmin,
  removeTestActivity,
  removeTestAdmin,
  testSql,
} from "./helpers";

// Services table (fixed columns, 10 per page, single and bulk delete), the activity log (20 per page, manual
// clean-up) and the loading screen. LOCAL test database only. Test rows: services "Test imp NN" (slug test-imp-NN)
// and activity rows with the action prefix "imp.test.".

test.describe.configure({ mode: "serial" });

const slug = (n: number) => `test-imp-${String(n).padStart(2, "0")}`;

test.beforeAll(async () => {
  await ensureTestAdmin();
  await clearStepUpLimits();
  const sql = testSql();
  try {
    await sql`delete from services where slug like 'test-imp-%'`;
    for (let n = 1; n <= 12; n++) {
      await sql`insert into services (slug, name, sort_order) values (${slug(n)}, ${"Test imp " + String(n).padStart(2, "0")}, ${-100 + n})`;
    }
    // 25 activity rows for paging, and two OLD rows for the clean-up (the log is append-only: trigger off for the setup).
    for (let n = 1; n <= 25; n++)
      await sql`insert into activity_log (actor_type, action, entity_type) values ('system', ${"imp.test." + n}, 'imp.test')`;
    await sql`alter table activity_log disable trigger activity_log_no_update_delete`;
    await sql`insert into activity_log (actor_type, action, entity_type, created_at) values ('system', 'imp.test.old', 'imp.test', now() - interval '200 days')`;
    await sql`alter table activity_log enable trigger activity_log_no_update_delete`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  const sql = testSql();
  try {
    await sql`delete from services where slug like 'test-imp-%'`;
  } finally {
    await sql.end();
  }
  await removeTestActivity("imp.test%");
  const sql2 = testSql();
  try {
    await sql2`alter table activity_log disable trigger activity_log_no_update_delete`;
    await sql2`delete from activity_log where entity_type = 'imp.test' or action like 'imp.test.%' or action in ('activity.purged', 'service.deleted')`;
    await sql2`alter table activity_log enable trigger activity_log_no_update_delete`;
  } finally {
    await sql2.end();
  }
  await removeTestAdmin();
});

const row = (page: import("@playwright/test").Page, name: string) =>
  page
    .getByRole("button", { name: `Actions for ${name}` })
    .locator("visible=true")
    .first();

test("services: a table with fixed column widths and the right headers", async ({ page }) => {
  await page.goto("/admin/settings/services");
  const headers = page.getByRole("columnheader");
  if (await headers.first().isVisible()) {
    await expect(headers).toHaveText(["", "Service", "Service fee", "On / Off", "Actions"]);
    const widths = await page
      .locator("table colgroup col")
      .evaluateAll((cols) => cols.map((c) => (c as HTMLElement).style.width));
    expect(widths).toEqual(["6%", "44%", "20%", "12%", "18%"]);
  }
});

test("services: 10 per page, with next and previous", async ({ page }) => {
  await page.goto("/admin/settings/services");
  await expect(page.getByText(/services?, 10 per page\./)).toBeVisible();
  const links = page.locator("ul[aria-label=Services] li, tbody tr").locator("visible=true");
  expect(await links.count()).toBeLessThanOrEqual(10);
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(/Page 2 of/)).toBeVisible();
});

test("services: Actions menu turns a service off and moves it", async ({ page }) => {
  await page.goto("/admin/settings/services");
  await row(page, "Test imp 01").click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Turn off" }).click();
  const sql = testSql();
  try {
    await expect
      .poll(
        async () =>
          (await sql`select is_active from services where slug = ${slug(1)}`)[0].is_active,
      )
      .toBe(false);
  } finally {
    await sql.end();
  }
});

test("services: delete one service with the confirm", async ({ page }) => {
  await page.goto("/admin/settings/services");
  await row(page, "Test imp 02").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("This cannot be undone.")).toBeVisible();
  // Without the code it is refused.
  await dialog.getByRole("button", { name: "Delete the service" }).click();
  await expect(dialog.getByText(/fresh 6-digit code/i)).toBeVisible();
  await dialog.getByLabel(/6-digit code/).fill("000000");
  await dialog.getByRole("button", { name: "Delete the service" }).click();
  await expect(dialog).toBeHidden();
  const sql = testSql();
  try {
    expect(await sql`select 1 from services where slug = ${slug(2)}`).toHaveLength(0);
    expect(await sql`select 1 from services where slug = ${slug(3)}`).toHaveLength(1);
  } finally {
    await sql.end();
  }
});

test("services: bulk delete with checkboxes", async ({ page }) => {
  await page.goto("/admin/settings/services");
  for (const name of ["Test imp 03", "Test imp 04"])
    await page
      .getByRole("checkbox", { name: `Select ${name}` })
      .locator("visible=true")
      .first()
      .click();
  await expect(page.getByText("2 services selected")).toBeVisible();
  await page.getByRole("button", { name: "Delete selected" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete 2 services" })).toBeVisible();
  await dialog.getByLabel(/6-digit code/).fill("000000");
  await dialog.getByRole("button", { name: "Delete the services" }).click();
  await expect(dialog).toBeHidden();
  const sql = testSql();
  try {
    expect(await sql`select 1 from services where slug in (${slug(3)}, ${slug(4)})`).toHaveLength(
      0,
    );
    const log = await sql`select 1 from activity_log where action = 'service.deleted'`;
    expect(log.length).toBeGreaterThanOrEqual(3);
  } finally {
    await sql.end();
  }
});

test("activity: 20 entries per page", async ({ page }) => {
  await page.goto("/admin/activity?action=imp.test");
  await expect(page.getByText(/entries, 20 per page/)).toBeVisible();
  await expect(page.locator("main li").filter({ hasText: "imp.test." })).toHaveCount(20);
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("main li").filter({ hasText: "imp.test." })).toHaveCount(6);
});

test("activity: manual clean-up needs the confirm, removes old entries, and is logged", async ({
  page,
}) => {
  await page.goto("/admin/activity");
  await page.getByRole("button", { name: "Clean up old entries" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Remove entries older than").selectOption("180");
  await expect(dialog.getByText(/will be removed/)).toBeVisible();
  await dialog.getByRole("button", { name: /^Remove \d+ entr/ }).click();
  await expect(dialog.getByText(/fresh 6-digit code/i)).toBeVisible();
  await dialog.getByLabel(/6-digit code/).fill("000000");
  await dialog.getByRole("button", { name: /^Remove \d+ entr/ }).click();
  await expect(dialog).toBeHidden();
  const sql = testSql();
  try {
    expect(await sql`select 1 from activity_log where action = 'imp.test.old'`).toHaveLength(0);
    expect(await sql`select 1 from activity_log where action = 'imp.test.1'`).toHaveLength(1);
    const entry = await sql`select details from activity_log where action = 'activity.purged'`;
    expect(entry).toHaveLength(1);
    expect(entry[0].details).toMatchObject({ olderThanDays: 180 });
  } finally {
    await sql.end();
  }
});

test("the admin pages still fit a phone", async ({ page }) => {
  for (const path of ["/admin/settings/services", "/admin/activity", "/admin/settings/users"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.screen.width,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
