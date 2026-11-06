import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  E2E_METHOD_ID,
  cleanTestData,
  createPaidRequest,
  createSentRequest,
  ensureTestAdmin,
  removeTestAdmin,
  testSql,
  waitForTurnstile,
} from "../e2e/helpers";

test.describe.configure({ mode: "serial" });

const OUT = path.resolve(__dirname, "../../public/case-study");
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test.beforeAll(async () => {
  await ensureTestAdmin();
  // Nicer fake names for the pictures. (Removed again by pnpm e2e:clean.)
  const sql = testSql();
  try {
    await sql`update payment_methods set name = 'GCash' where id = ${E2E_METHOD_ID}`;
    await sql`update services set name = 'Sample service A', short_description = 'A sample description.' where slug = 'test-service-e2e'`;
  } finally {
    await sql.end();
  }
});
test.afterAll(async () => {
  await cleanTestData();
  await removeTestAdmin();
});

// The Next.js development button must not appear in a picture.
async function shoot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      "nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }",
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 72 });
}

async function startRequest(page: Page) {
  await page.goto("/request?service=test-service-e2e");
  await page.getByLabel("Full name").fill("Ana Sample");
  await page.getByLabel("Email").fill("zolb-test+shots@example.com");
  await page.getByLabel("Mobile number").fill("917 123 4567");
  await page.getByRole("checkbox").check();
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your request is started" })).toBeVisible();
  return page.url().split("/request/")[1].split("/")[0];
}

test.describe("phone", () => {
  test.use({ viewport: PHONE, deviceScaleFactor: 1 });

  test("home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shoot(page, "home-phone");
  });

  test("payment and receipt", async ({ page }) => {
    const id = await startRequest(page);
    await page.goto(`/request/${id}/payment`);
    await expect(page.getByRole("heading", { name: "Pay with a QR code" })).toBeVisible();
    await page.getByRole("img", { name: /QR code/ }).scrollIntoViewIfNeeded();
    await shoot(page, "payment-phone");

    await page.goto(`/request/${id}/receipt`);
    const today = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Manila",
    });
    const dataUrl = await page.evaluate((day) => {
      const c = document.createElement("canvas");
      c.width = 900;
      c.height = 520;
      const x = c.getContext("2d")!;
      x.fillStyle = "#fff";
      x.fillRect(0, 0, 900, 520);
      x.fillStyle = "#000";
      x.font = "bold 44px Arial";
      x.fillText("GCash (sample)", 50, 80);
      x.font = "40px Arial";
      x.fillText("Amount Sent  PHP 1,250.00", 50, 190);
      x.fillText("Ref No. 1234 5678 9012", 50, 290);
      x.fillText(day + " 9:37 AM", 50, 390);
      return c.toDataURL("image/png");
    }, today);
    await page.getByLabel("Receipt screenshot").setInputFiles({
      name: "sample-receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
    });
    await page.getByRole("button", { name: "Read my receipt" }).click();
    await expect(page.getByLabel("Reference number")).toHaveValue("123456789012", {
      timeout: 90_000,
    });
    await page.getByLabel("Reference number").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Read my receipt" }).scrollIntoViewIfNeeded();
    await shoot(page, "receipt-phone");
  });

  test("tracking", async ({ page }) => {
    const r = await createSentRequest("waiting_for_client", "Sample Client");
    await page.goto("/track");
    await page.getByLabel("Tracking code").fill(r.code);
    await page.getByLabel(/Last 4 digits/).fill("4567");
    await waitForTurnstile(page);
    await page.getByRole("button", { name: "Show my request" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your request" })).toBeVisible();
    await shoot(page, "tracking-phone");
  });
});

test.describe("desktop admin", () => {
  test.use({ viewport: DESKTOP, deviceScaleFactor: 1 });

  test("verify and dashboard", async ({ page }) => {
    const paid = await createPaidRequest("Sample Client");
    const sql = testSql();
    try {
      await sql`update payments set method_snapshot = method_snapshot || '{"name":"GCash"}'::jsonb where request_id = ${paid.requestId}`;
    } finally {
      await sql.end();
    }
    await page.goto(`/admin/requests/${paid.requestId}`);
    await expect(
      page.getByText("Check this payment in your own GCash / Maya / BDO app first."),
    ).toBeVisible();
    await page.getByRole("heading", { name: "Payments" }).scrollIntoViewIfNeeded();
    await page
      .getByRole("heading", { name: "Payments" })
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await shoot(page, "admin-verify-desktop");

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Needs action" })).toBeVisible();
    await shoot(page, "admin-dashboard-desktop");
  });
});
