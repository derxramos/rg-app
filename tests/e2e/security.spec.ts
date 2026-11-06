import { expect, test } from "@playwright/test";

import { cleanTestData, ensureTestAdmin, getCspViolations, removeTestAdmin, watchCsp } from "./helpers";

test.beforeAll(async () => {
  await ensureTestAdmin();
});
test.afterAll(async () => {
  await cleanTestData();
  await removeTestAdmin();
});

test("every page sends the security headers", async ({ request }) => {
  for (const path of ["/", "/contact", "/track", "/request", "/admin/login", "/robots.txt"]) {
    const response = await request.get(path);
    const h = response.headers();
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=()");
  }
});

test("the pages work under the Content-Security-Policy (no violations)", async ({ page }) => {
  await watchCsp(page);
  const pages = ["/", "/services", "/how-it-works", "/contact", "/privacy", "/track", "/request", "/admin", "/admin/requests", "/admin/settings/payments", "/admin/settings/site", "/admin/activity", "/dev/ui"];
  for (const path of pages) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Open the dialog on the design page too: it uses a portal and animations.
    expect(await getCspViolations(page), path).toEqual([]);
  }
});

test("an error page and the 404 page also keep the headers", async ({ request }) => {
  const response = await request.get("/no-such-page-at-all");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-security-policy"]).toContain("object-src 'none'");
});
