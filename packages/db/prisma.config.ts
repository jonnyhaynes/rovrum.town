// Loads the single repo-root .env so `pnpm db:*` works from anywhere in the
// monorepo (Prisma otherwise only looks in this package's cwd).
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: "../../.env" });

// We read `process.env` directly rather than Prisma's `env()` helper on purpose:
// on Prisma 6 `env()` throws `PrismaConfigEnvError` at config-load time when the
// var is unset, which breaks `prisma generate` in environments that have no
// database (e.g. the Vercel build, which only needs the generated client, not a
// live connection). The placeholder is never used to connect — commands that
// actually talk to the DB (migrate/push/runtime) require a real DATABASE_URL and
// will fail loudly against this obviously-fake URL. (Prisma 7.2+ makes the URL
// optional for `generate`; revisit this when we upgrade.)
const url =
  process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
