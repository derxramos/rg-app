import { expect, test } from "@playwright/test";

import { cleanTestData, emailTemplatesFor, TINY_PNG, waitForTurnstile } from "./helpers";

test.describe.configure({ mode: "serial" });

// The test service is made by scripts/e2e-seed.ts before the site starts (see package.json).
test.afterAll(async () => {
  await cleanTestData();
});

test("a client can start a request, upload files, and send it", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/request?service=test-service-e2e");
  await expect(page.getByRole("heading", { level: 1, name: "Start a request" })).toBeVisible();
  await expect(page.getByLabel("Service", { exact: true })).toHaveValue("test-service-e2e");

  // The consent box is never ticked at the start, and the form needs it.
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByLabel("Full name").fill("Test Client");
  await page.getByLabel("Email").fill("zolb-test+e2e@example.com");
  await page.getByLabel("Mobile number").fill("917 123 4567");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Please tick the box to agree to the privacy notice.")).toBeVisible();
  // What the person typed is still there.
  await expect(page.getByLabel("Full name")).toHaveValue("Test Client");

  await page.getByRole("checkbox").check();
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Continue" }).click();

  // The tracking code is shown big, with a copy button.
  await expect(page.getByRole("heading", { name: "Your request is started" })).toBeVisible();
  const code = (await page.locator("p.font-mono").innerText()).trim();
  expect(code).toMatch(/^RG-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  const requestId = page.url().split("/request/")[1].split("/")[0];

  await page.getByRole("link", { name: "Continue to documents" }).click();
  await expect(page.getByRole("heading", { name: "Upload your documents" })).toBeVisible();
  await expect(page.getByText("Requirement 1")).toBeVisible();

  // A real PNG is accepted.
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({ name: "id photo.png", mimeType: "image/png", buffer: TINY_PNG });
  await expect(page.getByText(/Added \(/).first()).toBeVisible();

  // A program renamed to .jpg is refused by the server.
  await page
    .locator("input[type=file]")
    .last()
    .setInputFiles({
      name: "fake.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("MZ\x90\x00 this is not a picture at all"),
    });
  await expect(page.getByText(/different type/)).toBeVisible();

  await page.getByRole("link", { name: "Continue" }).click();
  // Phase 4: the payment step comes next. Skip it for now.
  await expect(page.getByRole("heading", { name: "Pay with a QR code" })).toBeVisible();
  await page.getByRole("link", { name: /Skip for now/ }).click();
  await expect(page.getByRole("heading", { name: "Check and send" })).toBeVisible();
  await expect(page.getByText("1 file", { exact: true })).toBeVisible();
  await expect(page.getByText("Not paid yet")).toBeVisible();

  // Another browser (no cookie) cannot see or change this request.
  const other = await browser.newContext({ baseURL });
  const otherPage = await other.newPage();
  await otherPage.goto(`/request/${requestId}/documents`);
  await expect(
    otherPage.getByRole("heading", { name: "We cannot open this request" }),
  ).toBeVisible();
  const forged = await other.request.post("/api/upload", {
    multipart: { requestId, file: { name: "a.png", mimeType: "image/png", buffer: TINY_PNG } },
  });
  expect(forged.status()).toBe(403);
  await other.close();

  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page.getByRole("heading", { name: "Your request was sent" })).toBeVisible();
  await expect(page.locator("p.font-mono")).toHaveText(code);

  // Sending the request wrote the emails to the log (they failed here, because no Brevo key is set).
  const emails = await emailTemplatesFor(requestId);
  expect(emails).toEqual(expect.arrayContaining(["request_submitted_admin:failed", "request_submitted_client:failed"]));

  // After sending, the draft cookie no longer works.
  await page.goto(`/request/${requestId}/documents`);
  await expect(page.getByRole("heading", { name: "We cannot open this request" })).toBeVisible();
});

test("the server refuses an upload with no access, whatever the file", async ({ request }) => {
  const response = await request.post("/api/upload", {
    multipart: {
      requestId: "00000000-0000-4000-8000-000000000000",
      file: { name: "a.png", mimeType: "image/png", buffer: TINY_PNG },
    },
  });
  expect(response.status()).toBe(403);
});
