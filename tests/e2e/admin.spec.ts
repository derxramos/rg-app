import { expect, test } from "@playwright/test";

import {
  E2E_METHOD_ID,
  cleanTestData,
  createPaidRequest,
  ensureTestAdmin,
  removeTestAdmin,
  removeTestServices,
} from "./helpers";

test.describe.configure({ mode: "serial" });

let paid: Awaited<ReturnType<typeof createPaidRequest>>;
const clientName = "Admin Test Client";

test.beforeAll(async () => {
  await ensureTestAdmin();
  paid = await createPaidRequest(clientName);
});
test.afterAll(async () => {
  await removeTestServices();
  await cleanTestData();
  await removeTestAdmin();
});

test("dashboard shows counts, the needs-action list and the storage meter", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: /Hello, Test/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs action" })).toBeVisible();
  await expect(page.getByText(clientName).first()).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /Storage used/ })).toBeVisible();
  await expect(page.getByText(/Emails sent today/)).toBeVisible();
  await expect(page.getByText(/Last cleanup: never/)).toBeVisible();
});

test("the request list filters, and opens the request", async ({ page }) => {
  await page.goto("/admin/requests?q=" + encodeURIComponent("Admin Test"));
  // On a phone the list is cards (the table is hidden), so look only at what is visible.
  await expect(page.getByText(clientName).locator("visible=true").first()).toBeVisible();
  await page.goto("/admin/requests?q=nobody-with-this-name");
  await expect(page.getByText("No requests found")).toBeVisible();
  await page.goto(`/admin/requests?q=${paid.code}`);
  await page.getByRole("link", { name: paid.code }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: paid.code })).toBeVisible();
});

test("verify needs the tick, then verifies and moves the request", async ({ page }) => {
  await page.goto(`/admin/requests/${paid.requestId}`);
  // The strong OCR warning is always above the Verify button.
  await expect(
    page.getByText("Check this payment in your own GCash / Maya / BDO app first."),
  ).toBeVisible();
  await expect(page.getByText("Read from the picture, then changed")).toBeVisible();
  await expect(page.getByText(/OCR first read/)).toBeVisible();

  await page.getByRole("button", { name: "Mark payment verified" }).click();
  await expect(
    page.getByText("Please tick the box to say you found this payment in your account."),
  ).toBeVisible();

  await page.getByLabel("I found this payment in our account.").check();
  await page.getByRole("button", { name: "Mark payment verified" }).click();
  // The page updates by itself: the payment card shows Verified and the Verify button is gone.
  await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark payment verified" })).toHaveCount(0);
  await expect(page.getByText("Payment verified").first()).toBeVisible();
});

test("status change and notes: internal and client look different", async ({ page }) => {
  await page.goto(`/admin/requests/${paid.requestId}`);
  await page.getByLabel("New status").selectOption({ label: "In progress" });
  await page.getByLabel("Message to the client (optional)").fill("We started working on it.");
  await page.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByText("Status changed.").first()).toBeVisible();

  await page.getByLabel("Who can see it?").selectOption("internal");
  await page.getByLabel("Text", { exact: true }).fill("Call the client on Monday.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Note saved.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Internal note \(staff only\) ·/)).toBeVisible();
  await expect(page.getByText(/Message to the client ·/)).toBeVisible();
  await expect(page.getByText("We started working on it.")).toBeVisible();
});

test("payment methods: a risky change needs a fresh code, and is logged", async ({ page }) => {
  await page.goto(`/admin/settings/payments/${E2E_METHOD_ID}`);
  await page.getByLabel("Account number").fill("9999 999 9999");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("A fresh code is needed")).toBeVisible();

  await page.getByLabel(/6-digit code/).fill("111111"); // a wrong code
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("A fresh code is needed")).toBeVisible();

  await page.getByLabel(/6-digit code/).fill("000000"); // development bypass code
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved. This change is in the activity log/).first()).toBeVisible();

  await page.goto("/admin/activity?action=payment_method");
  await expect(page.getByText("payment_method.account_changed").first()).toBeVisible();
  await expect(page.getByText("payment_method.row_changed").first()).toBeVisible();
});

test("a services change shows on the public website at once", async ({ page }) => {
  await page.goto("/admin/settings/services");
  await page.getByLabel("Name").fill("Test service two (e2e)");
  await page.getByRole("button", { name: "Create service" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Test service two (e2e)" }),
  ).toBeVisible();
  await expect(page.getByText("The checklist is empty")).toBeVisible();

  await page.getByLabel("Item", { exact: true }).last().fill("Requirement 1");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Saved. The website shows it now.").first()).toBeVisible();

  // The public list was cached for 5 minutes. updateTag makes the change show at once.
  await page.goto("/services");
  await expect(page.getByText("Test service two (e2e)")).toBeVisible();
});

test("site content shows on the public contact page at once", async ({ page }) => {
  await page.goto("/admin/settings/site");
  await page.getByLabel("Phone").fill("+63 900 111 2222");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved. The website shows it now.").first()).toBeVisible();
  await page.goto("/contact");
  await expect(page.getByText("+63 900 111 2222")).toBeVisible();

  // Only safe link types are accepted.
  await page.goto("/admin/settings/site");
  await page.getByLabel("Messenger link").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save" }).nth(2).click();
  await expect(page.getByText(/must start with https/)).toBeVisible();
});

test("CSV export downloads, escapes formulas, and is logged", async ({ page, request }) => {
  const sql = await import("./helpers").then((m) => m.testSql());
  try {
    await sql`update requests set client_full_name = '=SUM(1+1)' where id = ${paid.requestId}`;
  } finally {
    await sql.end();
  }
  await page.goto("/admin/export");
  await expect(page.getByText("Export a backup every week")).toBeVisible();
  const response = await request.get("/api/admin/export?type=requests");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const csv = await response.text();
  expect(csv).toContain("Tracking code");
  expect(csv).toContain("'=SUM(1+1)");
  await page.goto("/admin/activity?action=export");
  await expect(page.getByText("export.csv").first()).toBeVisible();
});

test("phone: bottom bar has 4 items and every control is at least 44 px tall", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone only");
  await page.goto("/admin");
  const bar = page.getByRole("navigation", { name: "Admin" }).last();
  await expect(bar.getByRole("link")).toHaveCount(4);
  const box = await bar.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(59);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a, input, select")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.height < 43.5 &&
          !e.closest("[data-slot=input-with-prefix]") &&
          !e.className.toString().includes("sr-only")
        );
      })
      .map((e) => (e.textContent || e.getAttribute("name") || "").trim().slice(0, 30)),
  );
  expect(small).toEqual([]);
});
