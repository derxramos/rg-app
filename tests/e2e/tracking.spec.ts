import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_ID,
  clearRateLimits,
  cleanTestData,
  createSentRequest,
  emailTemplatesFor,
  ensureTestAdmin,
  removeTestAdmin,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureTestAdmin();
});
test.beforeEach(async () => {
  await clearRateLimits();
});
test.afterAll(async () => {
  await cleanTestData();
  await removeTestAdmin();
  void E2E_ADMIN_ID;
});

const manilaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

async function track(page: Page, code: string, last4: string) {
  await page.goto("/track");
  await page.getByLabel("Tracking code").fill(code);
  await page.getByLabel(/Last 4 digits/).fill(last4);
  await page.getByRole("button", { name: "Show my request" }).click();
}

const NOT_FOUND = /We could not find a request with those details/;

test("a wrong code and wrong digits give the SAME message", async ({ page }) => {
  const r = await createSentRequest("submitted");
  await track(page, r.code, "0000");
  const first = await page.getByText(NOT_FOUND).first().innerText();
  await track(page, "RG-ZZZZZZZZ", "4567");
  const second = await page.getByText(NOT_FOUND).first().innerText();
  expect(first).toBe(second);
});

test("the right details show a minimal view: no files, no email, no phone", async ({ page }) => {
  const r = await createSentRequest("submitted", "Very Private Person");
  await track(page, r.code.toLowerCase(), "4567");
  await expect(page.getByRole("heading", { level: 1, name: "Your request" })).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("What happened")).toBeVisible();
  await expect(page.getByRole("link", { name: /Pay now/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Upload more documents/ })).toHaveCount(0);

  const html = await page.content();
  for (const secret of ["my-private-passport", "old-secret", "zolb-test+private", "+639171234567", "9171234567", "Very Private Person"]) {
    expect(html, secret).not.toContain(secret);
  }
});

test("after 5 wrong tries the code is locked, and the 6th is refused even with the right digits", async ({ page }) => {
  const r = await createSentRequest("submitted");
  for (let i = 0; i < 5; i++) {
    await track(page, r.code, "1111");
    await expect(page.getByText(NOT_FOUND).first()).toBeVisible();
  }
  await track(page, r.code, "4567");
  await expect(page.getByText("This code is locked for a short time")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your request" })).toHaveCount(0);
});

test("a visitor with no session is sent back to the form", async ({ page }) => {
  await page.goto("/track/result");
  await expect(page.getByRole("heading", { level: 1, name: "Track my request" })).toBeVisible();
});

test("Upload more documents shows only when Waiting for client, with no old files and no Remove", async ({ page }) => {
  const r = await createSentRequest("waiting_for_client");
  await track(page, r.code, "4567");
  await expect(page.getByText("Please send your valid ID.")).toBeVisible();
  await page.getByRole("link", { name: /Upload more documents/ }).click();
  await expect(page.getByRole("heading", { name: "Upload your documents" })).toBeVisible();
  await expect(page.getByText("my-private-passport")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Done. Back to my request" })).toBeVisible();
});

test("paying from the tracking page moves the request, tells the admin, and a failed email can be retried", async ({ page }) => {
  const r = await createSentRequest("submitted");
  await track(page, r.code, "4567");
  await page.getByRole("link", { name: /Pay now/ }).click();
  await expect(page.getByRole("heading", { name: "Pay with a QR code" })).toBeVisible();
  // A visitor from the tracking page sees no step bar, and a way back.
  await expect(page.getByRole("navigation", { name: "Request steps" })).toHaveCount(0);
  await page.getByRole("link", { name: /I paid/ }).click();
  await page.getByLabel("Reference number").fill("TRACKPAY0001");
  await page.getByLabel("Amount you paid").fill("750");
  await page.getByLabel("Date on the receipt").fill(manilaToday());
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit payment" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Your request" })).toBeVisible();
  await expect(page.getByText("Payment received. We are checking it.")).toBeVisible();
  await expect(page.getByText("Payment submitted", { exact: true }).first()).toBeVisible();
  // The request moved, so "Upload more" is not offered and paying again is not offered either.
  await expect(page.getByRole("link", { name: /Pay now/ })).toHaveCount(0);

  // The admin was emailed. No Brevo key is set here, so the log says "failed".
  expect(await emailTemplatesFor(r.requestId)).toContain("payment_submitted_admin:failed");

  await page.goto(`/admin/requests/${r.requestId}`);
  await expect(page.getByText("Email not sent").first()).toBeVisible();
  await expect(page.getByText("BREVO_API_KEY").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).first().click();
  // Still no key, so it fails again, with a clear message. It never breaks the page.
  await expect(page.getByText(/could not be sent again/).first()).toBeVisible();
});

test("an admin message and a status change are emailed (failed here: no Brevo key) and logged", async ({ page }) => {
  const r = await createSentRequest("submitted");
  await page.goto(`/admin/requests/${r.requestId}`);
  await page.getByLabel("New status").selectOption({ label: "Waiting for client" });
  await page.getByLabel("Message to the client (optional)").fill("Please send your valid ID.");
  await page.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByText("Status changed.").first()).toBeVisible();
  expect(await emailTemplatesFor(r.requestId)).toContain("status_changed_client:failed");
  // The client sees the message on the tracking page.
  await track(page, r.code, "4567");
  await expect(page.getByText("Please send your valid ID.")).toBeVisible();
});

test("the contact form shows the failed state with the backup links when the email cannot be sent", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Your name").fill("Contact Tester");
  await page.getByLabel("Email").fill("zolb-test+contact@example.com");
  await page.getByLabel("Your message").fill("Hello from the test.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("We could not send your message").first()).toBeVisible();
  await expect(page.getByText(/Messenger or Viber/).first()).toBeVisible();
});
