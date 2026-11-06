import { expect, test } from "@playwright/test";

// Basic checks that the public pages work. They need the site running with a database
// (for example `pnpm dev:db` in another terminal, with .env.local pointing to it).

test("home page has one main heading, the main links and the two start buttons", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Start a request" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Track my request" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Skip to main content/ })).toBeAttached();
});

test("how it works explains that payment is made in the client's own app", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText("You pay in your own app")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(5); // the 5 steps
});

test("contact form shows errors for empty fields and keeps the focus on the first one", async ({
  page,
}) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Please enter your name.")).toBeVisible();
  await expect(page.getByText("Please enter your email.")).toBeVisible();
  await expect(page.getByText("Please write your message.")).toBeVisible();
  await expect(page.getByLabel("Your name")).toBeFocused();
});

test("privacy notice shows a version and a date", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText(/^Version /)).toBeVisible();
  await expect(page.getByText(/^Date: /)).toBeVisible();
});

test("an unknown address shows the not found page with a way home", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the home page" })).toBeVisible();
});

test("robots.txt hides the private areas", async ({ request }) => {
  const response = await request.get("/robots.txt");
  const text = await response.text();
  for (const path of ["/admin", "/request", "/track", "/api"]) {
    expect(text).toContain(`Disallow: ${path}`);
  }
});

// Design check page (development only).
test("design check page shows all 8 status badges with words", async ({ page }) => {
  await page.goto("/dev/ui");
  for (const label of [
    "Draft",
    "Submitted",
    "Payment submitted",
    "Under review",
    "Waiting for client",
    "In progress",
    "Completed",
    "Cancelled",
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

test("the peso sign is shown", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByText("formatPesos(125000) = ₱1,250.00")).toBeVisible();
});
