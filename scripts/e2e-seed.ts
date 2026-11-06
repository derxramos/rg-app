// Runs BEFORE the end-to-end tests (see "test:e2e" in package.json), before the site starts.
// Public pages cache the services list for 5 minutes, so the test service must exist before the
// site is started, or the form would show an old, empty list.
//   tsx scripts/e2e-seed.ts          makes the test data
//   tsx scripts/e2e-seed.ts --clean  removes ALL test data again (service, payment method, admin, requests)
import {
  cleanTestData,
  ensureTestService,
  removeTestAdmin,
  removeTestMethod,
  removeTestServices,
  testSql,
} from "../tests/e2e/helpers";

async function main() {
  await cleanTestData();
  await removeTestMethod();
  if (process.argv.includes("--clean")) {
    await removeTestServices();
    await removeTestAdmin();
    const sql = testSql();
    try {
      await sql`delete from service_requirements where service_id in (select id from services where slug = 'test-service-e2e')`;
      await sql`delete from services where slug = 'test-service-e2e'`;
    } finally {
      await sql.end();
    }
    console.log("E2E test data removed.");
    return;
  }
  await ensureTestService();
  console.log("E2E test data is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
