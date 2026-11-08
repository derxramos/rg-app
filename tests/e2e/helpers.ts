// Helpers for end-to-end tests. They talk to the same database the site uses (DATABASE_URL in .env.local).
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

export const E2E_METHOD_ID = "99999999-9999-4999-8999-999999999999";

// Test data is written to and deleted from this database, so it must be a LOCAL test database
// (pnpm dev:db), never the live Supabase project. Set E2E_ALLOW_REMOTE_DB=1 only for a Supabase TEST project.
function assertLocalDatabase(url: string) {
  if (process.env.E2E_ALLOW_REMOTE_DB === "1") return;
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `The end-to-end tests only run on a local database, but DATABASE_URL points to "${host}". Run "pnpm dev:db" and use its address.`,
    );
  }
}

export function testSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `pnpm dev:db` and fill .env.local.");
  assertLocalDatabase(url);
  return postgres(url, { prepare: false, max: 1 });
}

// Test data uses clear markers: "Test service" names and zolb-test+... emails (CLAUDE.md test data rules).
export async function ensureTestService() {
  const sql = testSql();
  try {
    const [existing] = await sql`select id from services where slug = 'test-service-e2e'`;
    const id =
      existing?.id ??
      (
        await sql`insert into services (slug, name, short_description, sort_order)
                  values ('test-service-e2e', 'Test service (e2e)', 'Only for automatic tests.', 99) returning id`
      )[0].id;
    await sql`insert into service_requirements (service_id, label, details, is_required, sort_order)
              select ${id}, 'Requirement 1', 'Sample help text.', true, 1
              where not exists (select 1 from service_requirements where service_id = ${id})`;
    await sql`update services set is_active = true where id = ${id}`;
    // A payment method for the tests (clearly marked as a test).
    await sql`insert into payment_methods (id, name, parser_key, account_name, account_number, instructions, qr_image_path, is_active, sort_order)
              values (${E2E_METHOD_ID}, 'Test GCash (e2e)', 'gcash', 'SAMPLE - not real', '0000 000 0000', 'Only for automatic tests.', 'samples/sample-qr.svg', true, 1)
              on conflict (id) do update set is_active = true`;
    return id as string;
  } finally {
    await sql.end();
  }
}

// Removes everything the tests created (requests with a zolb-test email, and the test service).
export async function cleanTestData() {
  const sql = testSql();
  try {
    const ids = await sql`select id from requests where client_email like 'zolb-test+%'`;
    const list = ids.map((r) => r.id as string);
    if (list.length > 0) {
      await sql`delete from payments where request_id in ${sql(list)}`;
      await sql`delete from request_files where request_id in ${sql(list)}`;
      await sql`delete from email_log where request_id in ${sql(list)}`;
      await sql`delete from requests where id in ${sql(list)}`;
    }
    await sql`delete from rate_limits`;
    await sql`delete from email_log where to_email like 'zolb-test+%' or to_email = '(not set)'`;
  } finally {
    await sql.end();
  }
}

export async function countTestEmails(): Promise<number> {
  const sql = testSql();
  try {
    const [a] =
      await sql`select count(*)::int n from requests where client_email like 'zolb-test+%'`;
    return a.n as number;
  } finally {
    await sql.end();
  }
}

// A tiny valid PNG (1x1 pixel).
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Used only by scripts/e2e-seed.ts, before the site starts.
export async function removeTestMethod() {
  const sql = testSql();
  try {
    await sql`delete from payment_methods where id = ${E2E_METHOD_ID}`;
  } finally {
    await sql.end();
  }
}

// ---------- Admin tests ----------
// The local dev server has DEV_ADMIN_BYPASS_EMAIL set in .env.local (development only). It needs a TEST owner
// profile with that email. It is called out in PROGRESS.md and removed again by removeTestAdmin().
export const E2E_ADMIN_ID = "88888888-8888-4888-8888-888888888888";
export const E2E_ADMIN_EMAIL = "zolb-test+owner@example.com";

export async function ensureTestAdmin() {
  const sql = testSql();
  try {
    // One role column for everybody: this test account is an OWNER (called out in PROGRESS.md).
    await sql`insert into profiles (id, email, full_name, role, is_active)
              values (${E2E_ADMIN_ID}, ${E2E_ADMIN_EMAIL}, 'Test Owner', 'owner', true)
              on conflict (id) do update set role = 'owner', is_active = true`;
  } finally {
    await sql.end();
  }
}

export async function removeTestAdmin() {
  const sql = testSql();
  try {
    // The "last owner" rule would block this, so it is switched off for this one clean-up (test database only).
    await sql`alter table profiles disable trigger profiles_protect_last_owner`;
    await sql`delete from request_notes where author_id = ${E2E_ADMIN_ID}`;
    await sql`update payments set verified_by = null where verified_by = ${E2E_ADMIN_ID}`;
    await sql`update payments set recorded_by = null where recorded_by = ${E2E_ADMIN_ID}`;
    await sql`update request_status_events set changed_by = null where changed_by = ${E2E_ADMIN_ID}`;
    await sql`update payment_methods set updated_by = null where updated_by = ${E2E_ADMIN_ID}`;
    await sql`update site_settings set updated_by = null where updated_by = ${E2E_ADMIN_ID}`;
    await sql`delete from profiles where id = ${E2E_ADMIN_ID}`;
    await sql`alter table profiles enable trigger profiles_protect_last_owner`;
  } finally {
    await sql.end();
  }
}

// The confirm step (code or password) allows 5 tries per 15 minutes. Several test runs in a row would hit that
// limit, so the counters of the test owner are cleared before a spec that types a code. LOCAL test database only.
export async function clearStepUpLimits() {
  const sql = testSql();
  try {
    await sql`delete from rate_limits where key = ${"stepup:" + E2E_ADMIN_ID}`;
  } finally {
    await sql.end();
  }
}

// Removes the activity log rows that tests made for the test admin or for test accounts. The log is append-only
// (a trigger blocks delete), so the trigger is switched off for this one clean-up. LOCAL test database only.
export async function removeTestActivity(entityIdLike = "zolb-test%") {
  const sql = testSql();
  try {
    await sql`alter table activity_log disable trigger activity_log_no_update_delete`;
    await sql`delete from activity_log where actor_id = ${E2E_ADMIN_ID} or entity_id like ${entityIdLike}`;
    await sql`alter table activity_log enable trigger activity_log_no_update_delete`;
  } finally {
    await sql.end();
  }
}

// Profiles made by the development test login (zolb-test+...@example.com). Removes them again.
// Requests that point to them keep their rows (user_id becomes null).
export async function removeTestProfiles() {
  const sql = testSql();
  try {
    await sql`delete from profiles where email like 'zolb-test+%@example.com' and role = 'user'`;
  } finally {
    await sql.end();
  }
}

// A sent request with one pending payment, made directly in the database.
export async function createPaidRequest(name: string) {
  const sql = testSql();
  try {
    const [service] = await sql`select id from services where slug = 'test-service-e2e'`;
    const code =
      "RG-" +
      Math.random()
        .toString(36)
        .slice(2, 10)
        .toUpperCase()
        .replace(/[01OIL]/g, "2");
    const [request] =
      await sql`insert into requests (tracking_code, service_id, status, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at, submitted_at)
      values (${code}, ${service.id}, 'payment_submitted', ${name}, 'zolb-test+admin@example.com', '+639171234567', '4567', 'v1', now(), now()) returning id`;
    const ref = "ADM" + Math.floor(Math.random() * 1e9);
    const [payment] =
      await sql`insert into payments (request_id, payment_method_id, method_snapshot, reference_number, amount_centavos, paid_on, entry_method, ocr_raw_values)
      values (${request.id}, ${E2E_METHOD_ID}, ${sql.json({ name: "Test GCash (e2e)", accountName: "SAMPLE - not real", accountNumber: "0000 000 0000" })}, ${ref}, 125000, current_date, 'ocr_edited', ${sql.json({ reference: "ADM0", amount: "1250", date: "" })}) returning id`;
    await sql`insert into request_status_events (request_id, from_status, to_status) values (${request.id}, null, 'draft'), (${request.id}, 'draft', 'payment_submitted')`;
    return { requestId: request.id as string, code, paymentId: payment.id as string };
  } finally {
    await sql.end();
  }
}

export async function removeTestServices() {
  const sql = testSql();
  try {
    await sql`delete from service_requirements where service_id in (select id from services where slug like 'test-service-two%')`;
    await sql`delete from services where slug like 'test-service-two%'`;
    await sql`update site_settings set value = ${sql.json({ phone: "", email: "", address: "" })} where key = 'contact'`;
    await sql`update payment_methods set account_number = '0000 000 0000' where id = ${E2E_METHOD_ID}`;
  } finally {
    await sql.end();
  }
}

export async function clearRateLimits() {
  const sql = testSql();
  try {
    await sql`delete from rate_limits`;
  } finally {
    await sql.end();
  }
}

// A sent request with a known code and phone ending 4567, in the status you ask for.
export async function createSentRequest(status: string, name = "Track Test Client") {
  const sql = testSql();
  try {
    const [service] = await sql`select id from services where slug = 'test-service-e2e'`;
    const code =
      "RG-" +
      Array.from(
        { length: 8 },
        () => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[Math.floor(Math.random() * 31)],
      ).join("");
    const [request] =
      await sql`insert into requests (tracking_code, service_id, status, client_full_name, client_email, client_phone, client_phone_last4, consent_version, consent_at, submitted_at, public_message)
      values (${code}, ${service.id}, ${status}, ${name}, 'zolb-test+private@example.com', '+639171234567', '4567', 'v1', now(), now(), ${status === "waiting_for_client" ? "Please send your valid ID." : null}) returning id`;
    await sql`insert into request_status_events (request_id, from_status, to_status) values (${request.id}, null, 'draft'), (${request.id}, 'draft', 'submitted')`;
    await sql`insert into request_files (request_id, storage_path, original_name, mime_type, size_bytes) values (${request.id}, ${"requests/" + request.id + "/old-secret.pdf"}, 'my-private-passport.pdf', 'application/pdf', 10)`;
    return { requestId: request.id as string, code };
  } finally {
    await sql.end();
  }
}

export async function emailTemplatesFor(requestId: string): Promise<string[]> {
  const sql = testSql();
  try {
    const rows =
      await sql`select template, status from email_log where request_id = ${requestId} order by created_at`;
    return rows.map((r) => `${r.template}:${r.status}`);
  } finally {
    await sql.end();
  }
}

// Records every Content-Security-Policy violation on a page. Call BEFORE page.goto.
// Use getCspViolations(page) at the end of the test: it must be an empty list.
import type { Page } from "@playwright/test";

export async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${event.violatedDirective} blocked ${event.blockedURI}`,
      );
    });
  });
}

export async function getCspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

// When the site has a Turnstile site key (a production-like run), a form needs the token before it is sent.
// Without a key (normal development) there is no widget, and this returns at once.
export async function waitForTurnstile(page: Page) {
  if ((await page.locator(".cf-turnstile").count()) === 0) return;
  await page.waitForFunction(
    () => {
      const input = document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
      return Boolean(input?.value);
    },
    undefined,
    { timeout: 20_000 },
  );
}

// The development test user (see /api/dev-login). The site must run with DEV_USER_BYPASS_EMAILS containing it.
export const E2E_USER_EMAIL = "zolb-test+usera@example.com";
export const E2E_USER_B_EMAIL = "zolb-test+userb@example.com";

export async function signInAsTestUser(page: Page, email = E2E_USER_EMAIL) {
  await page.goto(`/api/dev-login?email=${encodeURIComponent(email)}&next=/`);
}
