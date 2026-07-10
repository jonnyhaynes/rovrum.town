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
const PLACEHOLDER = "postgresql://placeholder:placeholder@localhost:5432/placeholder";

// The schema references env("DATABASE_URL") and env("DIRECT_URL"); Prisma
// validates both exist before our datasource overrides apply, so ensure they're
// set here. DATABASE_URL falls back to a placeholder so `prisma generate` runs
// with no DB (e.g. the Vercel build). DIRECT_URL (the unpooled connection the
// CLI needs on pooled providers like Neon) falls back to DATABASE_URL, since a
// plain local Postgres serves both.
process.env.DATABASE_URL ??= PLACEHOLDER;
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
