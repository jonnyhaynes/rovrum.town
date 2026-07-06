// Loads the single repo-root .env so `pnpm db:*` works from anywhere in the
// monorepo (Prisma otherwise only looks in this package's cwd).
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: "../../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
