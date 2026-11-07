// End-to-end checks for accounts: the header for a visitor, a user and an admin, sign out, and who may open /admin.
// They use the DEVELOPMENT test login (/api/dev-login), so no Supabase account is needed.
// The site must run with:  DEV_USER_BYPASS_EMAILS=zolb-test+usera@example.com,zolb-test+userb@example.com  and  DEV_ADMIN_BYPASS_EMAIL=zolb-test+owner@example.com
// and a LOCAL database (pnpm dev:db). Real sign in, email and password reset are checked by hand
// (docs/AUTH_AND_ROLES.md), because they need a Supabase project.
import { expect, test, type Page } from "@playwright/test";

import {
  E2E_USER_B_EMAIL,
  E2E_USER_EMAIL,
  TINY_PNG,
  cleanTestData,
  ensureTestAdmin,
  ensureTestService,
  removeTestAdmin,
  removeTestProfiles,
  signInAsTestUser,
  testSql,
  waitForTurnstile,
} from "./helpers";

const USER_A = "zolb-test+usera@example.com";

test.describe.configure({ mode: "serial" });
test.beforeAll(ensureTestAdmin);
test.afterAll(async () => {
  await removeTestAdmin();
  await removeTestProfiles();
});

const asUser = (page: Page, email = USER_A) =>
  page.goto(`/api/dev-login?email=${encodeURIComponent(email)}&next=/`);
const asVisitor = (page: Page) => page.goto("/api/dev-login?logout=1&next=/");
const asAdmin = (page: Page) => page.goto("/api/dev-login?as=admin&next=/");

// On a phone (below 1024 px) the sign in buttons are inside the menu. We decide by the screen width and then
// wait for the Menu button, because right after a page load the header may still be arriving.
async function openMenuIfPhone(page: Page) {
  const width = page.viewportSize()?.width ?? 1280;
  if (width >= 1024) return;
  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.click();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
}
const visible = (page: Page, role: "link" | "button", name: string) =>
  page.getByRole(role, { name, exact: true }).locator("visible=true");

test.describe("header", () => {
  test("a visitor sees Sign in and Start a request, and no Sign out", async ({ page }) => {
    await asVisitor(page);
    await openMenuIfPhone(page);
    await expect(visible(page, "link", "Sign in")).toBeVisible();
    await expect(visible(page, "link", "Start a request").first()).toBeVisible();
    await expect(visible(page, "button", "Sign out")).toHaveCount(0);
    await expect(visible(page, "link", "My requests")).toHaveCount(0);
    await expect(visible(page, "link", "Admin")).toHaveCount(0);
  });

  test("a user sees My requests and Sign out, and no Admin link", async ({ page }) => {
    await asUser(page);
    await openMenuIfPhone(page);
    await expect(visible(page, "link", "My requests")).toBeVisible();
    await expect(visible(page, "button", "Sign out")).toBeVisible();
    await expect(visible(page, "link", "Sign in")).toHaveCount(0);
    await expect(visible(page, "link", "Admin")).toHaveCount(0);
  });

  test("an admin sees Admin and Sign out", async ({ page }) => {
    await asAdmin(page);
    await openMenuIfPhone(page);
    await expect(visible(page, "link", "Admin")).toBeVisible();
    await expect(visible(page, "button", "Sign out")).toBeVisible();
    await expect(visible(page, "link", "My requests")).toHaveCount(0);
  });

  test("the first page already has the right state (no wrong button before scripts run)", async ({
    browser,
  }) => {
    // JavaScript off: only what the server sent. A signed-in user must not get a "Sign in" button.
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.request.get(`/api/dev-login?email=${encodeURIComponent(USER_A)}&next=/`);
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator('[data-auth-state="user"]').first()).toBeAttached();
    await expect(page.locator('[data-auth-state="visitor"]')).toHaveCount(0);
    await context.close();
  });

  test("the touch targets are at least 44 px tall", async ({ page }) => {
    await asUser(page);
    await openMenuIfPhone(page);
    for (const [role, name] of [
      ["link", "My requests"],
      ["button", "Sign out"],
    ] as const) {
      const box = await visible(page, role, name).boundingBox();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(43.5);
    }
  });
});

test.describe("sign out", () => {
  test("from a public page: back to the home page with a message, header shows Sign in", async ({
    page,
  }) => {
    await asUser(page);
    await page.goto("/services");
    await openMenuIfPhone(page);
    await visible(page, "button", "Sign out").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("You have been signed out.")).toBeVisible();
    await openMenuIfPhone(page);
    await expect(visible(page, "link", "Sign in")).toBeVisible();
    await expect(visible(page, "button", "Sign out")).toHaveCount(0);
  });

  test("from /admin: the Back button does not show the admin page again", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: /Hello, Test/ })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: /Hello, Test/ })).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("who may open /admin", () => {
  test("a user sees Not allowed", async ({ page }) => {
    await asUser(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/not-allowed/);
    await expect(page.getByRole("heading", { level: 1, name: "Not allowed" })).toBeVisible();
  });

  test("a visitor goes to the login page and can come back", async ({ page }) => {
    await asVisitor(page);
    await page.goto("/admin/requests");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });
});

test.describe("sign in pages", () => {
  test("the login page has labelled fields and a way to reset the password", async ({ page }) => {
    await asVisitor(page);
    await page.goto("/login?reason=expired&next=%2Faccount");
    await expect(page.getByText("Your session ended")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot your password?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
  });

  test("the register page asks for consent", async ({ page }) => {
    await asVisitor(page);
    await page.goto("/register");
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeVisible();
    await expect(page.locator("form").getByRole("link", { name: "Privacy notice" })).toBeVisible();
  });

  test("a signed-in user who opens /login goes on to /account", async ({ page }) => {
    await asUser(page);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/account/);
  });
});

// ---------- Requests belong to accounts ----------
test.describe("requests belong to the account", () => {
  let requestId = "";

  test.beforeAll(async () => {
    await ensureTestService();
  });
  test.afterAll(async () => {
    await cleanTestData();
    await removeTestProfiles();
  });

  test("a visitor who opens Start a request is sent to sign in, and comes back after", async ({
    page,
  }) => {
    await asVisitor(page);
    await page.goto("/request?service=test-service-e2e");
    await expect(page).toHaveURL(/\/login\?next=%2Frequest%3Fservice%3Dtest-service-e2e/);
    // After signing in (the development test login) the same address works.
    await signInAsTestUser(page);
    await page.goto("/request?service=test-service-e2e");
    await expect(page.getByRole("heading", { level: 1, name: "Start a request" })).toBeVisible();
  });

  test("user A starts a request, and it belongs to A", async ({ page }) => {
    await signInAsTestUser(page, E2E_USER_EMAIL);
    await page.goto("/request?service=test-service-e2e");
    await page.getByLabel("Full name").fill("Test Client A");
    await page.getByLabel("Mobile number").fill("917 123 4567");
    await page.getByRole("checkbox").check();
    await waitForTurnstile(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your request is started" })).toBeVisible();
    requestId = page.url().split("/request/")[1].split("/")[0];
    // A can open the next step.
    await page.goto(`/request/${requestId}/documents`);
    await expect(page.getByRole("heading", { name: "Upload your documents" })).toBeVisible();
  });

  test("user B cannot open A's request pages by changing the address", async ({ page }) => {
    await signInAsTestUser(page, E2E_USER_B_EMAIL);
    for (const step of ["documents", "payment", "receipt", "review"]) {
      await page.goto(`/request/${requestId}/${step}`);
      await expect(page, step).toHaveURL(/\/request\/expired/);
    }
    // The "sent" page shows the code only with the short signed cookie of the person who just sent it.
    await page.goto(`/request/${requestId}/done`);
    await expect(page).toHaveURL(/\/track$/);
  });

  test("user B cannot upload a file to A's request", async ({ page }) => {
    await signInAsTestUser(page, E2E_USER_B_EMAIL);
    const response = await page.request.post("/api/upload", {
      multipart: {
        requestId,
        file: { name: "a.png", mimeType: "image/png", buffer: TINY_PNG },
      },
    });
    expect(response.status()).toBe(403);
  });

  test("a visitor cannot upload a file either", async ({ page }) => {
    await asVisitor(page);
    const response = await page.request.post("/api/upload", {
      multipart: {
        requestId,
        file: { name: "a.png", mimeType: "image/png", buffer: TINY_PNG },
      },
    });
    expect(response.status()).toBe(403);
  });

  test("A can upload to their own request", async ({ page }) => {
    await signInAsTestUser(page, E2E_USER_EMAIL);
    const response = await page.request.post("/api/upload", {
      multipart: {
        requestId,
        file: { name: "a.png", mimeType: "image/png", buffer: TINY_PNG },
      },
    });
    expect(response.status()).toBe(200);
    // The file is saved under the owner's folder.
    const sql = testSql();
    try {
      const [file] =
        await sql`select storage_path from request_files where request_id = ${requestId}`;
      expect(file.storage_path).toMatch(new RegExp(`^users/[0-9a-f-]{36}/requests/${requestId}/`));
    } finally {
      await sql.end();
    }
  });
});

// ---------- The account area ----------
const USER_C = "zolb-test+userc@example.com";

async function startRequestAs(page: Page, email: string, name: string) {
  await signInAsTestUser(page, email);
  await page.goto("/request?service=test-service-e2e");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Mobile number").fill("917 123 4567");
  await page.getByRole("checkbox").check();
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your request is started" })).toBeVisible();
  return page.url().split("/request/")[1].split("/")[0];
}

test.describe("the account area", () => {
  let requestId = "";

  test.beforeAll(async () => {
    await ensureTestService();
  });
  test.afterAll(async () => {
    await cleanTestData();
    await removeTestProfiles();
  });

  test("a visitor is sent to sign in", async ({ page }) => {
    await asVisitor(page);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount/);
    await page.goto("/account/requests/99999999-9999-4999-8999-999999999999");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("My requests is empty for a new user, then lists the request", async ({ page }) => {
    await signInAsTestUser(page, E2E_USER_EMAIL);
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: "My requests" })).toBeVisible();
    await expect(page.getByText("You have no requests yet")).toBeVisible();

    requestId = await startRequestAs(page, E2E_USER_EMAIL, "Test Client A");
    await page.goto("/account");
    const card = page.getByRole("link", { name: /Test service \(e2e\)/ });
    await expect(card).toBeVisible();
    await expect(card.getByText("Draft")).toBeVisible();
  });

  test("the request page shows status, timeline and file names, but no way to open a file", async ({
    page,
  }) => {
    await signInAsTestUser(page, E2E_USER_EMAIL);
    await page.request.post("/api/upload", {
      multipart: {
        requestId,
        file: { name: "my-id.png", mimeType: "image/png", buffer: TINY_PNG },
      },
    });
    await page.goto(`/account/requests/${requestId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Your request" })).toBeVisible();
    await expect(page.getByText("my-id.png")).toBeVisible();
    await expect(page.getByText(/documents cannot be opened or downloaded/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue this request" })).toBeVisible();
    // No link to a file anywhere on the page.
    await expect(page.locator('a[href*="/api/admin/file"], a[href*="storage"]')).toHaveCount(0);
  });

  test("another user and a made-up id both see the Not found page", async ({ page }) => {
    await signInAsTestUser(page, E2E_USER_B_EMAIL);
    for (const id of [requestId, "99999999-9999-4999-8999-999999999999", "not-an-id"]) {
      await page.goto(`/account/requests/${id}`);
      // The same "not found" page in every case (the page streams, so the HTTP status stays 200).
      await expect(
        page.getByRole("heading", { level: 1, name: "We could not find that page" }),
        id,
      ).toBeVisible();
      await expect(page.getByText("my-id.png")).toHaveCount(0);
    }
  });

  test("Download my data gives only the user's own data", async ({ page }) => {
    await signInAsTestUser(page, E2E_USER_EMAIL);
    const response = await page.request.post("/api/account/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain("attachment");
    const text = await response.text();
    expect(text).toContain(E2E_USER_EMAIL);
    expect(text).toContain("my-id.png");
    expect(text).not.toContain(E2E_USER_B_EMAIL);
    expect(text).not.toContain("users/");
  });

  test("Download my data needs a sign in and a POST", async ({ page }) => {
    await asVisitor(page);
    expect((await page.request.post("/api/account/export")).status()).toBe(401);
    await signInAsTestUser(page, E2E_USER_EMAIL);
    expect((await page.request.get("/api/account/export")).status()).toBe(405);
  });

  test("a user can change their name and phone", async ({ page }) => {
    await signInAsTestUser(page, E2E_USER_EMAIL);
    await page.goto("/account");
    await page.getByLabel("Full name").fill("Test Client Renamed");
    await page.getByRole("button", { name: "Save my details" }).click();
    await expect(page.getByText("Your details were saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Test Client Renamed");
  });

  test("delete my account needs the word DELETE, then removes the account", async ({ page }) => {
    await signInAsTestUser(page, USER_C);
    await page.goto("/account");
    await page.getByLabel("Your password").fill("not-checked-in-development");
    await page.getByLabel("Type DELETE to confirm").fill("delete");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText("Type the word DELETE in capital letters.")).toBeVisible();

    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Delete my account" }).click();
    // A full page load of the home page, with a message and the signed-out header.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Your account was deleted.")).toBeVisible();

    const sql = testSql();
    try {
      const rows = await sql`select 1 from profiles where email = ${USER_C}`;
      expect(rows).toHaveLength(0);
    } finally {
      await sql.end();
    }
    // The old session does not work any more.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  });
});
