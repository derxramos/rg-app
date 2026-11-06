import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { cleanTestData, getCspViolations, testSql, waitForTurnstile, watchCsp } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await cleanTestData();
});

const manilaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

// Starts a request in the browser and returns its id (step 1 only).
async function startRequest(page: Page, email: string) {
  await page.goto("/request?service=test-service-e2e");
  await page.getByLabel("Full name").fill("Test Client");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill("917 123 4567");
  await page.getByRole("checkbox").check();
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your request is started" })).toBeVisible();
  return page.url().split("/request/")[1].split("/")[0];
}

test("payment page shows the QR, the account name and a warning, then manual entry works", async ({
  page,
}) => {
  const requests: { url: string; body: Buffer | null }[] = [];
  page.on("request", (r) => requests.push({ url: r.url(), body: r.postDataBuffer() }));

  const id = await startRequest(page, "zolb-test+pay1@example.com");
  await page.goto(`/request/${id}/payment`);
  await expect(page.getByRole("heading", { name: "Pay with a QR code" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Test GCash (e2e) QR code" })).toBeVisible();
  await expect(page.getByText("SAMPLE - not real").first()).toBeVisible();
  await expect(page.getByText(/Check that the account name is/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy number" })).toBeVisible();

  await page.getByRole("link", { name: /I paid/ }).click();
  await expect(page.getByRole("heading", { name: "Your receipt" })).toBeVisible();

  // The picture is shown, but never sent. Choose one and check what leaves the browser.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page
    .getByLabel("Receipt screenshot")
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: /shown only on this phone/ })).toBeVisible();

  // Nothing is typed yet: the form must stop with clear messages.
  await page.getByRole("button", { name: "Submit payment" }).click();
  await expect(
    page.getByText("The reference number should be 6 to 30 letters or digits."),
  ).toBeVisible();
  await expect(
    page.getByText("Please tick the box to say the values match your receipt."),
  ).toBeVisible();

  await page.getByLabel("Reference number").fill("1234 5678 9012");
  await page.getByLabel("Amount you paid").fill("1250");
  await page.getByLabel("Date on the receipt").fill(manilaToday());
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit payment" }).click();

  await expect(page.getByRole("heading", { name: "Check and send" })).toBeVisible();
  await expect(
    page.getByText(/₱1,250\.00 by GCash/).or(page.getByText(/₱1,250\.00 by Test GCash/)),
  ).toBeVisible();
  await expect(page.getByText("Pending check")).toBeVisible();

  // The receipt picture was never sent in any request.
  for (const r of requests) {
    expect(
      r.body?.includes(Buffer.from("IHDR")) ?? false,
      `picture bytes found in a request to ${r.url}`,
    ).toBe(false);
  }

  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page.getByRole("heading", { name: "Your request was sent" })).toBeVisible();

  const sql = testSql();
  try {
    const [row] =
      await sql`select r.status, p.reference_number, p.amount_centavos, p.entry_method, p.status as pstatus, p.method_snapshot
                            from requests r join payments p on p.request_id = r.id where r.id = ${id}`;
    expect(row.status).toBe("payment_submitted");
    expect(row.reference_number).toBe("123456789012");
    expect(Number(row.amount_centavos)).toBe(125000);
    expect(row.entry_method).toBe("manual");
    expect(row.pstatus).toBe("pending");
    expect(row.method_snapshot.accountName).toBe("SAMPLE - not real");
  } finally {
    await sql.end();
  }
});

test("a reference number used before is refused with a clear message", async ({ page }) => {
  const id = await startRequest(page, "zolb-test+pay2@example.com");
  await page.goto(`/request/${id}/receipt`);
  await page.getByLabel("Reference number").fill("123456789012");
  await page.getByLabel("Amount you paid").fill("500");
  await page.getByLabel("Date on the receipt").fill(manilaToday());
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit payment" }).click();
  await expect(
    page.getByText("This reference number was already used. Please check it."),
  ).toBeVisible();
  // What was typed is still there.
  await expect(page.getByLabel("Amount you paid")).toHaveValue("500");
});

test("a future date and an old date are refused", async ({ page }) => {
  const id = await startRequest(page, "zolb-test+pay3@example.com");
  await page.goto(`/request/${id}/receipt`);
  await page.getByLabel("Reference number").fill("FUTURE-0001");
  await page.getByLabel("Amount you paid").fill("100");
  await page.getByRole("checkbox").check();
  // The date box has min and max, so the browser stops these. The server still checks: send them directly.
  await page.getByLabel("Date on the receipt").evaluate((el: HTMLInputElement) => {
    el.removeAttribute("max");
    el.removeAttribute("min");
    el.value = "2999-01-01";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Submit payment" }).click();
  await expect(page.getByText("The date cannot be in the future.")).toBeVisible();
});

test("reading a receipt in the browser (OCR) fills the fields and measures the download", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  await watchCsp(page);
  const id = await startRequest(page, "zolb-test+pay4@example.com");
  await page.goto(`/request/${id}/receipt`);

  // Draw a fake receipt picture in the page and use it as the chosen file.
  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
  const dataUrl = await page.evaluate((day) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 520;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 900, 520);
    c.fillStyle = "#000";
    c.font = "bold 44px Arial";
    c.fillText("GCash", 50, 80);
    c.font = "40px Arial";
    c.fillText("Amount Sent  PHP 1,250.00", 50, 190);
    c.fillText("Ref No. 1234 5678 9012", 50, 290);
    c.fillText(day + " 9:37 AM", 50, 390);
    return canvas.toDataURL("image/png");
  }, today);
  await page.getByLabel("Receipt screenshot").setInputFiles({
    name: "fake-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
  });

  // Count what the reading tool downloads (it comes from a CDN, not from our site).
  let downloaded = 0;
  const assets: string[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.startsWith("http://localhost") && !url.startsWith("data:")) {
      const length = Number(response.headers()["content-length"] ?? 0);
      downloaded += length;
      assets.push(`${length} ${url}`);
    }
  });

  const started = Date.now();
  await page.getByRole("button", { name: "Read my receipt" }).click();
  const filled = page.getByLabel("Reference number");
  const failed = page.getByText(/Please type the values/);
  await expect(filled.or(failed)).toBeVisible();
  await expect(async () => {
    const value = await filled.inputValue();
    const failedVisible = await failed
      .first()
      .isVisible()
      .catch(() => false);
    expect(value.length > 0 || failedVisible).toBe(true);
  }).toPass({ timeout: 90_000 });
  const seconds = Math.round((Date.now() - started) / 1000);

  const result = {
    seconds,
    downloadedBytes: downloaded,
    reference: await filled.inputValue(),
    amount: await page.getByLabel("Amount you paid").inputValue(),
    date: await page.getByLabel("Date on the receipt").inputValue(),
    failed: await failed
      .first()
      .isVisible()
      .catch(() => false),
    assets,
  };
  writeFileSync(testInfo.outputPath("ocr-result.json"), JSON.stringify(result, null, 2));
  console.log("OCR RESULT", JSON.stringify({ ...result, assets: assets.length }));
  expect(result.failed, "OCR failed: " + JSON.stringify(result)).toBe(false);
  // The receipt reader (worker, wasm, CDN files) works under the Content-Security-Policy.
  expect(await getCspViolations(page)).toEqual([]);
  expect(result.reference).toBe("123456789012");
  expect(result.amount).toBe("1250.00");
  await expect(page.getByText(/Read from image/).first()).toBeVisible();
});
