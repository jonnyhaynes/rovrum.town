import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "./test/test-db.js";

// Runs once before the workers test suite. Ensures the isolated `rovrum_test`
// schema exists and has the current tables, so ingest.test.ts can create/delete
// rows there without touching dev data (issue #21). `prisma db push` creates the
// schema if missing and syncs the tables (schema-only, no migration history) —
// the test schema is throwaway, so a fast idempotent sync is all it needs.
//
// prisma.config.ts disables .env loading, so we hand the CLI the test URL via
// process.env of the child (the config reads process.env.DATABASE_URL directly).
export default async function setup() {
  const url = testDatabaseUrl();

  // @rovrum/db is where the schema + prisma.config.ts live; run the CLI there.
  const dbPackageDir = fileURLToPath(new URL("../../packages/db", import.meta.url));

  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"], {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "inherit",
  });
}
