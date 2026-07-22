# Plan — CI: run lint / types / tests on every PR

**Problem.** The repo's workflow assumes "CI green before a human merges"
(`CLAUDE.md`, `docs/dev-workflow.md`), but the only GitHub Actions workflow is the
scheduled `ingest.yml`. Nothing runs `lint`, `check-types`, `test`, or `build` on
pushes or PRs — checks have depended entirely on contributors running them locally.
(Surfaced during issue #21.)

**Goal.** A `ci` workflow that runs on every PR to `main` (and on push to `main`)
and goes red if lint, type-check, tests, or build fail — so the human reviewer has a
real signal to gate the merge on.

## Scope

- One new workflow: `.github/workflows/ci.yml`. No changes to app/package code.
- Runs the existing root scripts through Turborepo: `lint`, `check-types`, `test`,
  `build`. These already exist in `package.json` / `turbo.json`.

## The one non-obvious bit — the test job needs Postgres

`@rovrum/workers` tests include real-DB integration tests (`ingest.test.ts`). Since
issue #21 they run against an isolated `rovrum_test` schema **derived from
`DATABASE_URL`**, so any ephemeral Postgres works — CI just needs to provide one.

Approach, mirroring `ingest.yml`'s proven setup steps:

1. **`postgres:16` service container** on the runner, health-checked, exposed on
   `localhost:5432` with throwaway creds.
2. `DATABASE_URL` / `DIRECT_URL` env pointing at that container (schema `public`;
   the workers tests re-point themselves to `rovrum_test`).
3. Steps: checkout → pnpm/action-setup → setup-node (node 22, pnpm cache) →
   `pnpm install --frozen-lockfile` → `pnpm db:generate` → `pnpm db:migrate`
   (creates the `public` tables; the workers global-setup then `db push`es the test
   schema) → `pnpm lint` / `pnpm check-types` / `pnpm test` / `pnpm build`.

No secrets required — the DB is a local throwaway container, unlike `ingest.yml`
which talks to the real Neon DB via secrets. This keeps CI hermetic.

### Job shape (decision)

Single `ci` job runs all four steps sequentially (simplest, one Postgres container,
Turbo caches within the run). Splitting into a matrix (lint/types without DB, test/
build with DB) is a possible optimisation but adds config for marginal speed on a
repo this size — **deferred**.

## Verification

- Open this PR; confirm the new `ci` check appears, runs, and is green.
- Sanity: the four steps all execute (visible in the Actions log), and `test` shows
  the `@rovrum/workers` suite running against `rovrum_test` on the service Postgres.
- Optional negative check: temporarily break a type locally to confirm CI would go
  red (revert before merge).

## Notes from implementation

- **Turbo 2 Strict Environment Mode:** task processes only see env vars declared
  in `turbo.json`. `DATABASE_URL`/`DIRECT_URL` weren't declared, so the workers
  integration tests (and Prisma generate / SSG build) couldn't read them through
  turbo — locally they silently fell back to the repo `.env`; in CI (no `.env`)
  they'd have failed. Fix: added `"globalEnv": ["DATABASE_URL", "DIRECT_URL"]`.
  Verified by running the full `pnpm test`/`build` chain via turbo against a fresh
  throwaway `rovrum_ci` Postgres with no `.env` present — the workers suite then
  correctly targeted `localhost` (its `rovrum_test` schema), not Neon.
- `db:migrate` is `prisma migrate dev` (dev-only, interactive). CI uses
  `prisma migrate deploy` directly, which applies committed migrations
  non-interactively against the fresh CI DB.

## Out of scope

- Branch protection / required-status-check settings (a repo admin toggle, not a
  file in the repo — note it in the PR for the maintainer to enable).
- Playwright browser install (the workers *tests* stub adapters and don't launch a
  browser; only `ingest:once` needs Chromium, which is `ingest.yml`'s concern).
- Caching Turbo remote cache / build artifacts beyond the default pnpm cache.
