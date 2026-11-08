import { expect, test } from "@playwright/test";

import {
  clearStepUpLimits,
  createSentRequest,
  ensureTestAdmin,
  removeTestAdmin,
  cleanTestData,
  testSql,
} from "./helpers";

// "Record a payment (cash or other)" in the admin area, for a client who chose "I will pay later".
// LOCAL test database only. The signed-in test account is the development TEST OWNER (see helpers.ts).

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureTestAdmin();
  await clearStepUpLimits();
});
test.afterAll(async () => {
  await cleanTestData();
  await removeTestAdmin();
});

test("the owner records a cash payment and the request is marked as paid", async ({ page }) => {
  const { requestId } = await createSentRequest("submitted");
  await page.goto(`/admin/requests/${requestId}`);
  await expect(
    page.getByRole("heading", { name: "Record a payment (cash or other)" }),
  ).toBeVisible();

  // "Other" without a note is refused by the server.
  await page.getByLabel("How did the client pay?").selectOption("other");
  await page.getByLabel("Amount received (pesos)").fill("1500");
  await page.getByRole("button", { name: /Record payment and mark as paid/ }).click();
  await expect(page.getByText(/That did not work/)).toBeVisible();

  await page.getByLabel("How did the client pay?").selectOption("cash");
  await page.getByLabel(/Receipt or OR number/).fill("OR-12345");
  await page.getByRole("button", { name: /Record payment and mark as paid/ }).click();
  await expect(page.getByText(/The payment was recorded/).first()).toBeVisible();

  const sql = testSql();
  try {
    await expect
      .poll(async () => (await sql`select status from requests where id = ${requestId}`)[0].status)
      .toBe("payment_verified");
    const [pay] =
      await sql`select status, entry_method, reference_number from payments where request_id = ${requestId}`;
    expect(pay).toMatchObject({
      status: "verified",
      entry_method: "offline",
      reference_number: "OR12345",
    });
  } finally {
    await sql.end();
  }

  // The payment is listed, and the owner can void it with a reason.
  await page.reload();
  await expect(page.getByText(/Recorded by/)).toBeVisible();
  await page.getByLabel(/Why is it wrong/).fill("Typed the wrong amount");
  await page.getByRole("button", { name: "Void this payment" }).click();
  // The form disappears after the void (the payment is rejected), so the proof is in the database.
  const sql2 = testSql();
  try {
    await expect
      .poll(
        async () =>
          (await sql2`select status from payments where request_id = ${requestId}`)[0].status,
      )
      .toBe("rejected");
  } finally {
    await sql2.end();
  }
});
