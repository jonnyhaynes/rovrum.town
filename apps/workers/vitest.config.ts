import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./test/test-db.js";

// Force the workers test run onto an isolated `rovrum_test` Postgres schema so
// ingest.test.ts's cleanup (deleteMany) never touches seeded dev data (issue
// #21). `test.env` is applied before test modules import @rovrum/db, so the
// Prisma singleton is constructed against the test schema. vitest.global-setup
// creates the schema and pushes the tables before the suite runs.
const TEST_DATABASE_URL = testDatabaseUrl();

export default defineConfig({
  test: {
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      // Local Postgres serves both pooled and direct connections.
      DIRECT_URL: TEST_DATABASE_URL,
    },
  },
});
