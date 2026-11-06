// Helpers for end-to-end tests. They talk to the same database the site uses (DATABASE_URL in .env.local).
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

export function testSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `pnpm dev:db` and fill .env.local.");
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
