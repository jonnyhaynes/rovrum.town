// Load the repo-root .env for local dev. In containers/production, env vars come
// from the environment and no .env file exists — dotenv is a no-op there, and it
// never overrides an already-set variable. Import this first from any entrypoint.
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// apps/workers/src/env.ts → repo root is four levels up.
const repoRoot = fileURLToPath(new URL("../../../.env", import.meta.url));
loadEnv({ path: repoRoot });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env (see infra/README.md) " +
      "or provide it via the environment.",
  );
}
