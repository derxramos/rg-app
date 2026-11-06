// Runs BEFORE the end-to-end tests (see "test:e2e" in package.json), before the site starts.
// Public pages cache the services list for 5 minutes, so the test service must exist before the
// site is started, or the form would show an old, empty list.
import { cleanTestData, ensureTestService } from "../tests/e2e/helpers";

async function main() {
  await cleanTestData();
  await ensureTestService();
  console.log("E2E test data is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
