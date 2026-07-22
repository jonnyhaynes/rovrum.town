# Plan — Issue #21: Workers integration tests wipe the dev DB

**Issue:** [#21](https://github.com/jonnyhaynes/rovrum.town/issues/21) — `apps/workers`
integration tests call `deleteMany()` against the real dev Postgres, wiping seeded
`content_items` on any local `pnpm test`.

**Acceptance:** Running `pnpm test` locally leaves seeded `content_items` intact.

## Root cause

- `apps/workers/src/ingest.test.ts` is the only real-DB integration test. It imports the
  module singleton `prisma` from `@rovrum/db` and, in `beforeEach`/`afterAll`, runs
  `deleteMany()` across `contentItem`, `storyCluster`, `ingestRun`, `source`.
- `@rovrum/db` builds its client from `env("DATABASE_URL")` at import time. Locally that
  URL points at the dev DB's `public` schema (`?schema=public`). So the test's cleanup
  hits dev data directly.
- The other four workers test files (`seed`, `scheduler`, `cluster-items`, `ingest-pass`)
  are pure/unit tests — they stub Prisma or use plain objects and never touch the DB.

## Approach — dedicated test **schema** on the same local Postgres

Chosen over Testcontainers (new infra/dep) and transactional rollback (the code under
test opens its own connections; wrapping is invasive). A separate Postgres **schema** is
free, fully isolated, needs no second container, and matches how the datasource already
parameterises the connection via `?schema=`.

Isolation seam: override `DATABASE_URL` to use `?schema=rovrum_test` **before** any module
imports `@rovrum/db`. Vitest's config `test.env` is applied before test modules load, so
the singleton is constructed against the test schema. A `globalSetup` runs migrations
(`prisma migrate deploy` / `db push`) against that schema so its tables exist.

### Changes

1. **`apps/workers/vitest.config.ts`** (new)
   - `test.env.DATABASE_URL` = dev URL with `schema` forced to `rovrum_test`, derived from
     the ambient `DATABASE_URL` (fall back to the `.env.example` default) so it tracks
     whatever local DB the developer uses. Also set `DIRECT_URL` to match.
   - `test.globalSetup` → `./vitest.global-setup.ts`.

2. **`apps/workers/vitest.global-setup.ts`** (new)
   - Compute the same test URL, `CREATE SCHEMA IF NOT EXISTS rovrum_test`, then run
     `prisma db push` (schema-only, no migration history needed for a throwaway test
     schema) against it so tables exist before the suite runs.

3. **`apps/workers/src/ingest.test.ts`** — no logic change needed; it now transparently
   targets `rovrum_test`. Add a one-line comment noting the schema isolation so nobody
   re-points it at dev.

4. **Docs:** brief note in `infra/README.md` (or `docs/dev-workflow.md`) that workers
   integration tests use an isolated `rovrum_test` schema and never touch dev data.

## Verification

- `pnpm --filter @rovrum/workers test` passes, all `ingest.test.ts` cases green.
- Seed dev data, run `pnpm test` from repo root, confirm `content_items` count is
  unchanged (the acceptance criterion).
- Confirm `rovrum_test` schema exists and holds the test's transient rows; `public`
  is untouched.

## Notes from implementation

- `prisma.config.ts` disables `.env` loading, so the global setup hands the CLI the
  test URL via the child process `env` (the config reads `process.env.DATABASE_URL`).
- `prisma db push` creates the `rovrum_test` schema itself, so no separate
  `CREATE SCHEMA` step is needed.
- The repo currently has **no test/lint/typecheck CI** (only the scheduled `ingest`
  workflow). The issue's "CI unaffected" note assumed a test CI that doesn't exist.
  Adding one is out of scope here but worth a follow-up.

## Out of scope

- Migrating to Testcontainers.
- Reworking the other (already safe) unit tests.
