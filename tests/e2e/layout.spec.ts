import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_ID,
  E2E_USER_EMAIL,
  cleanTestData,
  createPaidRequest,
  ensureTestAdmin,
  ensureTestService,
  removeTestAdmin,
  removeTestProfiles,
  removeTestServices,
  signInAsTestUser,
  testSql,
  waitForTurnstile,
} from "./helpers";
import { auditPage, type LayoutProblem } from "./layout-audit";

// Layout test: no card, pill or badge may stick out, overlap or be cut off. It uses LONG data (a 60 character
// name, a 50 character email, the longest service name, the number 12,345).
//   pnpm exec playwright test layout --project=desktop                 quick run: 6 widths, light mode
//   LAYOUT_FULL=1 pnpm exec playwright test layout --project=desktop   full audit: 17 widths (zoom included),
//                                                                      light and dark, owner, admin and staff
//   LAYOUT_REPORT=path.json writes every problem to a file.
// Types a, b, c and d (see layout-audit.ts) fail the test. "d-ellipsis" and "e" are listed in the report only.

test.describe.configure({ mode: "serial" });
test.setTimeout(40 * 60_000);

const FULL = process.env.LAYOUT_FULL === "1";
// At 125 % and 150 % browser zoom the page gets fewer CSS pixels, so zoom is the same as a narrower window:
// 1366 / 1.25 = 1093, 1366 / 1.5 = 911, 1920 / 1.25 = 1536, 1920 / 1.5 = 1280.
const WIDTHS = FULL
  ? [320, 360, 390, 430, 600, 768, 820, 911, 1024, 1093, 1180, 1280, 1366, 1440, 1536, 1920, 2560]
  : [360, 768, 1024, 1280, 1366, 1920];
const THEMES = FULL ? ["light", "dark"] : ["light"];
const FAIL_TYPES = new Set(["a", "b", "c", "d"]);

const LONG_NAME = "Maria Cristina Dela Cruz-Santos de los Reyes Villanueva Jr III"; // 60 characters
const LONG_EMAIL = "zolb-test+" + "y".repeat(24) + "-long-address@example.com"; // 50 characters
const LONG_SERVICE =
  "SSS, Pag-IBIG and PhilHealth registration and payment for employers and employees";
const LONG_USER_ID = "66666666-6666-4666-8666-00000000000";

type Found = LayoutProblem & { page: string; width: number; theme: string; role: string };
const found: Found[] = [];

async function setTheme(page: Page, theme: string) {
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
}

async function checkPage(page: Page, name: string, url: string, role = "owner") {
  await page.goto(url, { waitUntil: "load" });
  // A page can move on after it loads (for example, a staff account is sent to "not allowed").
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  for (const theme of THEMES) {
    await page.waitForLoadState("load");
    await setTheme(page, theme);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 700 ? 800 : 900 });
      await page.waitForTimeout(120);
      let problems: LayoutProblem[];
      try {
        problems = await auditPage(page, { phone: width <= 430 });
      } catch {
        // The page moved on while we looked (a redirect or a refresh). Wait for it, then look once more.
        await page.waitForLoadState("load");
        await page.waitForTimeout(500);
        problems = await auditPage(page, { phone: width <= 430 });
      }
      for (const p of problems) found.push({ ...p, page: name, width, theme, role });
    }
  }
}

test.beforeAll(async () => {
  await ensureTestAdmin();
  await ensureTestService();
  const sql = testSql();
  try {
    await sql`update profiles set full_name = ${LONG_NAME} where id = ${E2E_ADMIN_ID}`;
    // The longest service name, with a long description.
    const [svc] = await sql`select id from services where slug = 'test-service-two-long'`;
    const serviceId: string =
      svc?.id ??
      (
        await sql`insert into services (slug, name, short_description, sort_order)
                  values ('test-service-two-long', ${LONG_SERVICE}, ${"A long sample description that is about thirty percent longer than the English text will be after a Filipino translation. ".repeat(2)}, 98)
                  returning id`
      )[0].id;
    await sql`insert into service_requirements (service_id, label, details, is_required, sort_order)
              select ${serviceId}, ${"Requirement with a very long label " + "x".repeat(40)}, 'Sample help text that is quite long and goes on for a while.', true, 1
              where not exists (select 1 from service_requirements where service_id = ${serviceId})`;
    // Requests in every status, with long names and long emails.
    const statuses = [
      "submitted",
      "under_review",
      "waiting_for_client",
      "payment_submitted",
      "payment_verified",
      "in_progress",
      "completed",
      "cancelled",
    ];
    for (const [i, status] of statuses.entries()) {
      await sql`insert into requests (tracking_code, service_id, status, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at, submitted_at)
                values (${"RG-WAYTEST" + (i + 2)}, ${serviceId}, ${status}, ${LONG_NAME}, ${LONG_EMAIL}, '+639171234567', '4567', 'v1', now(), now())`;
    }
    // 12,345 requests "Submitted" in total, so the big-number layout is tested.
    await sql`insert into requests (tracking_code, service_id, status, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at, submitted_at)
              select 'RG-B' || lpad(n::text, 7, '0'), ${serviceId}, 'submitted', 'Bulk Layout Client', 'zolb-test+bulk' || n || '@example.com', '+639171234567', '4567', 'v1', now(), now()
              from generate_series(1, 12344) as n`;
    // Accounts with long names and emails (clients, staff and an ADMIN-role account, local test database only).
    const roles = ["user", "user", "staff", "admin"];
    for (const [i, role] of roles.entries()) {
      await sql`insert into profiles (id, email, full_name, role, is_active)
                values (${LONG_USER_ID + (i + 1)}, ${"zolb-test+layout-" + "z".repeat(24) + i + "@example.com"}, ${LONG_NAME}, ${role}, true)
                on conflict (id) do nothing`;
    }
    // A second owner, so the test owner can be set to admin and staff (there must always be one owner).
    await sql`insert into profiles (id, email, full_name, role, is_active)
              values (${LONG_USER_ID + "8"}, 'zolb-test+layout-second-owner@example.com', 'Second Test Owner', 'owner', true)
              on conflict (id) do nothing`;
    await sql`insert into profiles (id, email, full_name, role, is_active)
              values (${LONG_USER_ID + "9"}, ${E2E_USER_EMAIL}, ${LONG_NAME}, 'user', true)
              on conflict (id) do update set full_name = ${LONG_NAME}`;
    await sql`update requests set user_id = ${LONG_USER_ID + "9"} where tracking_code in ('RG-WAYTEST2','RG-WAYTEST4','RG-WAYTEST7')`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  const sql = testSql();
  try {
    await sql`delete from requests where tracking_code like 'RG-WAYTEST%' or tracking_code like 'RG-B%'`;
    // The "last owner" rule would block this clean-up, so it is switched off for it (local test database only).
    await sql`alter table profiles disable trigger profiles_protect_last_owner`;
    await sql`delete from profiles where id::text like '66666666-6666-4666-8666-%'`;
    await sql`alter table profiles enable trigger profiles_protect_last_owner`;
  } finally {
    await sql.end();
  }
  await cleanTestData();
  await removeTestProfiles();
  await removeTestServices();
  const sql2 = testSql();
  try {
    await sql2`delete from service_requirements where service_id in (select id from services where slug = 'test-service-two-long')`;
    await sql2`delete from services where slug = 'test-service-two-long'`;
  } finally {
    await sql2.end();
  }
  await removeTestAdmin();
  if (process.env.LAYOUT_REPORT) {
    writeFileSync(process.env.LAYOUT_REPORT, JSON.stringify(found, null, 2));
  }
});

const PUBLIC_PAGES: [string, string][] = [
  ["Home", "/"],
  ["Services", "/services"],
  ["Service detail (long name)", "/services/test-service-two-long"],
  ["How it works", "/how-it-works"],
  ["Contact", "/contact"],
  ["Track my request", "/track"],
  ["Privacy notice", "/privacy"],
  ["Terms of service", "/terms"],
  ["Login", "/login"],
  ["Register", "/register"],
  ["Not found", "/this-page-does-not-exist"],
  ["Auth error", "/auth/error"],
];

test("public pages", async ({ page }) => {
  await page.goto("/api/dev-login?logout=1&next=/");
  for (const [name, url] of PUBLIC_PAGES) await checkPage(page, name, url);
});

test("signed-in user pages and the request flow", async ({ page }) => {
  await signInAsTestUser(page);
  await checkPage(page, "My requests", "/account");
  await checkPage(page, "Change password", "/account/change-password");
  // A started request with a long name, to reach every step of the flow.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/request?service=test-service-e2e");
  await page.getByLabel("Full name").fill(LONG_NAME);
  // A signed-in client has the email filled in and locked.
  const emailField = page.getByLabel("Email");
  if (await emailField.isEditable()) await emailField.fill(E2E_USER_EMAIL);
  await page.getByLabel("Mobile number").fill("917 123 4567");
  await page.getByRole("checkbox").check();
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your request is started" })).toBeVisible();
  const id = page.url().split("/request/")[1].split("/")[0];
  await checkPage(page, "Request: code", `/request/${id}/code`);
  await checkPage(page, "Request: details", `/request/${id}/details`);
  await checkPage(page, "Request: documents", `/request/${id}/documents`);
  await checkPage(page, "Request: payment (QR)", `/request/${id}/payment`);
  await checkPage(page, "Request: receipt", `/request/${id}/receipt`);
  await checkPage(page, "Request: review", `/request/${id}/review`);
  await checkPage(page, "Request: start form", "/request?service=test-service-e2e");
  const sql = testSql();
  try {
    const [r] = await sql`select id from requests where tracking_code = 'RG-WAYTEST4'`;
    await checkPage(page, "My request detail", `/account/requests/${r.id}`);
  } finally {
    await sql.end();
  }
  await page.goto("/api/dev-login?email=zolb-test%2Buserb%40example.com&next=/account");
  await checkPage(page, "My requests (empty)", "/account");
});

test("tracking result", async ({ page }) => {
  await page.goto("/api/dev-login?logout=1&next=/track");
  await page.getByLabel("Tracking code").fill("RG-WAYTEST4");
  await page.getByLabel(/Last 4 digits/).fill("4567");
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Show my request" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your request" })).toBeVisible();
  await checkPage(page, "Track: result", page.url());
});

const ADMIN_PAGES: [string, string][] = [
  ["Admin: Dashboard", "/admin"],
  ["Admin: Requests", "/admin/requests"],
  ["Admin: Requests (filtered)", "/admin/requests?status=submitted"],
  ["Admin: Requests (empty)", "/admin/requests?q=zzzzzzzznothing"],
  ["Admin: Settings hub", "/admin/settings"],
  ["Admin: Site settings", "/admin/settings/site"],
  ["Admin: Payment methods", "/admin/settings/payments"],
  ["Admin: Services", "/admin/settings/services"],
  ["Admin: Files settings", "/admin/settings/files"],
  ["Admin: Admin users", "/admin/settings/users"],
  ["Admin: Activity", "/admin/activity"],
  ["Admin: Export", "/admin/export"],
  ["Admin: Security", "/admin/security"],
];

const ROLES = FULL ? ["owner", "admin", "staff"] : ["owner"];
for (const role of ROLES) {
  test(`admin pages as ${role}`, async ({ page }) => {
    const sql = testSql();
    let requestId: string;
    let serviceId: string;
    let methodId: string;
    try {
      await sql`update profiles set role = ${role} where id = ${E2E_ADMIN_ID}`;
      const paid = await createPaidRequest(LONG_NAME);
      requestId = paid.requestId;
      await sql`update requests set client_email = ${LONG_EMAIL} where id = ${requestId}`;
      await sql`update requests set service_id = (select id from services where slug = 'test-service-two-long') where id = ${requestId}`;
      [{ id: serviceId }] = await sql`select id from services where slug = 'test-service-two-long'`;
      [{ id: methodId }] = await sql`select id from payment_methods limit 1`;
    } finally {
      await sql.end();
    }
    // The development proxy only lets a request through when the dev cookie exists. A value that is not a test
    // email is ignored by the session code, so the dev admin bypass (the test owner) applies.
    await page
      .context()
      .addCookies([{ name: "rg_dev_user", value: "admin-bypass", url: "http://localhost:3000" }]);
    for (const [name, url] of ADMIN_PAGES) await checkPage(page, name, url, role);
    await checkPage(page, "Admin: Request detail", `/admin/requests/${requestId}`, role);
    await checkPage(page, "Admin: Service edit", `/admin/settings/services/${serviceId}`, role);
    await checkPage(
      page,
      "Admin: Payment method edit",
      `/admin/settings/payments/${methodId}`,
      role,
    );
    await checkPage(page, "Admin: Login screen", "/admin/login", role);
  });
}

test("layout problems", async () => {
  const failing = found.filter((p) => FAIL_TYPES.has(p.type));
  const lines = failing.map(
    (p) => `${p.type} ${p.page} @${p.width} ${p.theme} ${p.role}: ${p.element} — ${p.detail}`,
  );
  expect(lines, lines.join("\n")).toEqual([]);
});
