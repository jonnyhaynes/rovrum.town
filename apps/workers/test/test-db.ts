// Shared helper: derive an isolated test-database URL from the ambient
// DATABASE_URL by forcing the Postgres `schema` to `rovrum_test`.
//
// Why a separate schema: the workers integration tests (ingest.test.ts) call
// `deleteMany()` to keep dedup assertions deterministic. Against the dev DB's
// `public` schema that wipes seeded content (issue #21). Pointing the whole test
// run at a throwaway `rovrum_test` schema on the same local Postgres isolates it
// with zero extra infra — the dev `public` schema is never touched.
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// apps/workers/test/test-db.ts → repo root is three levels up.
loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

export const TEST_SCHEMA = "rovrum_test";

/**
 * The base connection to derive from — the developer's real DATABASE_URL, or the
 * `.env.example` local default so tests still run before a `.env` is copied.
 */
const BASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://rovrum:rovrum@localhost:5432/rovrum?schema=public";

/** BASE_URL with the `schema` query param forced to `rovrum_test`. */
export function testDatabaseUrl(base: string = BASE_URL): string {
  const url = new URL(base);
  url.searchParams.set("schema", TEST_SCHEMA);
  return url.toString();
}
