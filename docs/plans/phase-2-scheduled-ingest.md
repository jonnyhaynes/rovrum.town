# Phase 2 — Scheduled ingest into Neon + rebuild trigger

> **Status:** Draft for review — no code until a human approves this plan.
> **Depends on:** merged web MVP (#16/#18/#20) and Neon wiring (#22). Neon is set
> as the Vercel build DB (Preview + Production) but is currently **empty**, so
> `/news` builds with zero articles.
> **Covers:** plan ticket 5 (`web-rebuild-trigger`) + the ingestion-into-Neon half.
> **Architecture refs:** `docs/ARCHITECTURE.md` §2 (workers), §6 (phases); the
> ingestion deviation below is a deliberate, flagged departure from §2.

---

## 1. Goal

Get real Rotherham content into Neon on a schedule, and rebuild the static `/news`
feed after each ingest — with no always-on service to host.

Two cron jobs, both in **GitHub Actions** (in-repo, portable, free; secrets in
Actions, never in the repo):

1. **Ingest** — run one ingest pass over all *due* enabled sources against Neon.
2. **Rebuild** — ping a **Vercel Deploy Hook** to rebuild the site from Neon.

### Decisions locked with the author (2026-07-14)

| Decision | Choice | Consequence |
|---|---|---|
| **Worker model** | **Scheduled one-shot** (not a 24/7 pg-boss worker) | No worker host to run/pay for. **Deviation from ADR §2** (long-running pg-boss workers) — justified: tiny volume, cost-minimal, solo dev. pg-boss stays the model if/when we need continuous processing. |
| **Ingest entry** | **New `ingest:once` CLI** in `@rovrum/workers` | Reuses `runIngest` + `findDueSources` (both already tested). Replaces the throwaway local script. |
| **Cron host** | **GitHub Actions** | One scheduled workflow: ingest → rebuild. |
| **Refresh** | **Scheduled Vercel Deploy Hook rebuild** | SSG freshness = cron cadence. Decoupled from ingest (rebuild runs after ingest in the same workflow). |

---

## 2. The one-shot ingest CLI (`@rovrum/workers`)

A new committed entrypoint mirroring `seed-cli.ts`, e.g. `src/ingest-cli.ts`, wired
as `"ingest:once"` in the workers `package.json`.

Behaviour:
- Load env (`./env.js`), connect the real Prisma client.
- Find **due** sources via the existing `findDueSources(prisma, now)` (respects
  per-source `fetchCadence` + `lastFetchedAt`) — so repeated cron runs don't refetch
  everything every time. A `--all` flag can force every enabled source (useful for a
  first fill / manual run).
- Run `runIngest(deps, sourceId)` per source, **sequentially** (politeness; no
  pg-boss batching needed for a one-shot). PLAYWRIGHT sources need a browser: either
  skip them by default (`--no-browser`, RSS/HTML only) or launch one shared Chromium
  like `apps/workers/src/index.ts` does. **Default: include Playwright** (the CI
  runner can install Chromium), with a flag to skip.
- Update `lastFetchedAt` per source (whatever `runIngest` already does — confirm; if
  not, the CLI sets it) so cadence gating works across runs.
- Print a per-source summary (status / found / new / dropped), exit non-zero if
  *every* source failed (so the cron surfaces a real outage) but tolerate individual
  source failures.
- `prisma.$disconnect()` at the end.

**Tests (test-first):** the CLI's orchestration is thin; the real logic
(`runIngest`, `findDueSources`, `isDue`) is already unit-tested. Add a focused test
for the CLI's *selection + summary* logic (due vs `--all`, partial-failure exit code)
by injecting a stub ingest fn and a fake source list — no network, no real DB.

> **DB-safety note:** this must run against **Neon**, driven by the workflow's
> `DATABASE_URL` secret. It never touches local dev data. (Separately, the workers
> integration suite still wipes its DB — tracked in #21.)

---

## 3. GitHub Actions workflow

One scheduled workflow, e.g. `.github/workflows/ingest.yml`:

- **Trigger:** `schedule:` cron (propose **hourly**, tune later) + `workflow_dispatch`
  for manual runs.
- **Concurrency:** a `concurrency` group so overlapping runs don't double-ingest.
- **Steps:**
  1. checkout, setup pnpm + Node 22, `pnpm install --frozen-lockfile`.
  2. `pnpm db:generate` (needs no real DB — placeholder fallback from #22).
  3. *(if Playwright kept)* install Chromium.
  4. `pnpm --filter @rovrum/workers ingest:once` with `DATABASE_URL` / `DIRECT_URL`
     from **Actions secrets** (Neon pooled + direct).
  5. **Rebuild:** `curl -X POST "$VERCEL_DEPLOY_HOOK_URL"` (secret) — fires only if
     ingest didn't hard-fail. Deploy hook rebuilds the site, which reads fresh Neon.
- **Secrets (you create; I reference):** `DATABASE_URL`, `DIRECT_URL`,
  `VERCEL_DEPLOY_HOOK_URL`.

Migrations: Neon's schema must exist first. **One-time human step** (or a guarded
`prisma migrate deploy` step): `pnpm db:migrate` against Neon before the first ingest.
Recommend doing it once manually to keep the cron read/write-only, not schema-owning.

---

## 4. Human steps (credentials / console — I can't do these)

1. **Create a Vercel Deploy Hook** (Project → Settings → Git → Deploy Hooks) for the
   production branch; copy the URL.
2. **Add GitHub Actions secrets:** `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon
   direct), `VERCEL_DEPLOY_HOOK_URL`.
3. **Migrate Neon once:** locally point `.env` at Neon and `pnpm db:migrate` (creates
   the schema). *(Or approve a guarded migrate step in the workflow.)*
4. First run: trigger the workflow via `workflow_dispatch` (optionally `--all`) to fill
   Neon, then confirm `/news` renders after the rebuild.

---

## 5. Acceptance criteria (test contract)

- [ ] `pnpm --filter @rovrum/workers ingest:once` runs one pass over due sources
  against the configured DB, prints a summary, exits 0 on partial success and non-zero
  only if all sources fail. `--all` forces every enabled source.
- [ ] CLI selection/summary logic unit-tested with a stubbed ingest fn (no network/DB).
- [ ] Workflow runs on schedule + manual dispatch, ingests, then pings the deploy hook;
  secrets sourced from Actions, none committed.
- [ ] After a run, Neon has NEWS `content_items` and a rebuilt `/news` shows them.
- [ ] lint / check-types / test green; CI green before review.

---

## 6. Open items for the reviewer

- **Cron cadence:** hourly to start? (Sources set their own `fetchCadence`; the cron is
  just the tick.)
- **Playwright in CI:** include (installs Chromium each run, slower) or RSS/HTML-only
  for the scheduled job and leave Playwright sources for a manual/less-frequent run?
- **Migrations:** one-time manual `db:migrate` against Neon (recommended), or a guarded
  `migrate deploy` step in the workflow?
- **Rebuild coupling:** rebuild in the *same* workflow after ingest (proposed), or a
  separate independent schedule?

---

## 7. Non-goals

- No always-on worker / Railway / Fly host (explicitly deferred; revisit if volume
  grows).
- No change to the pg-boss worker (`apps/workers/src/index.ts`) — it stays for the
  future continuous-processing path.
- No go-live flip of `/` → feed (still a separate deliberate step).
- No new verticals.
