# Phase 1 — Ingestion: the data pipeline

> **Status:** Approved 2026-07-06. Broken into GitHub issues (see below); build proceeds
> task-by-task, test-first, on `feat/phase-1-ingestion`.

## Context

Rovrum's **data pipeline is the product** (`docs/ARCHITECTURE.md` §1). Phase 0 landed the
foundation: the pnpm + Turborepo monorepo, `infra/docker-compose` (Postgres + MinIO), and
`@rovrum/db` — the Prisma content model (`Source`, `ContentItem`, `SocialPost`, `IngestRun`)
with its first migration. Nothing yet _fills_ that model.

Phase 1 is the **"data pipeline first" milestone** (`ARCHITECTURE.md` §6): pull from real
Rotherham sources, normalize into `content_item`, dedup, and run it on a schedule as a
long-running Dockerised worker on **pg-boss** (not serverless cron). The acceptance test for
the whole phase is human and visual: **open Prisma Studio and see clean, deduplicated,
Rotherham-relevant content flowing in from real feeds.**

### Decisions locked with the user

- **Adapters this phase: RSS _and_ HTML (Cheerio).** Build the adapter interface, a robust
  RSS adapter (covers the 19 verified feeds), and a Cheerio HTML adapter (council jobs,
  Eventbrite). **Playwright is deferred** to a follow-up (Phase 1b) — the JS-rendered sources
  (notably Rotherham United's own site) are seeded as `disabled` rows so the registry is
  complete but nothing tries to scrape them until the Playwright adapter exists.
- **Relevance filtering: keyword allow-list at normalize time.** Regional feeds (The Star,
  BBC South Yorkshire, Reddit) carry non-Rotherham items. A source flagged `regional` in its
  config runs items through a Rotherham keyword filter (town/area names) before they're
  stored. Rotherham-native feeds skip the filter.
- **Full phase scope per `ARCHITECTURE.md` §6:** adapter interface + real sources + pg-boss
  scheduler in `apps/workers` + dedup + `ingest_runs` observability.
- **Sources are seeded, not hand-entered.** A seed script writes the verified source registry
  (below) so the pipeline has real inputs from the first run.

### Environment / current tooling (verified this session)

- Node ≥22, pnpm 10.33.0, Turborepo (`turbo.json` `tasks`), Prisma **`prisma-client`**
  generator (output `packages/db/src/generated/prisma`, gitignored), client re-exported from
  `@rovrum/db`.
- **pg-boss v10 API** (confirmed against current docs): `new PgBoss(connectionString)`,
  `boss.start()`, `boss.createQueue(name, { retryLimit, retryDelay, retryBackoff, deadLetter })`,
  `boss.schedule(name, cron, data, options)`, `boss.work(name, { localConcurrency }, handler)`
  where the handler receives an **array** of jobs (`async ([job]) => …`). Jobs are addressed by
  **queue name**. pg-boss creates its own `pgboss` schema in the same Postgres.

## The seed source registry (verified live 2026-07-06)

All feeds fetched with a browser User-Agent and confirmed HTTP 200 + valid RSS/Atom (or valid
scrape HTML) on 2026-07-06. `regional: true` sources get the Rotherham keyword filter.

### RSS feeds — enabled

| Name                                    | Vertical | URL                                                                          | Flags                        |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------- | ---------------------------- |
| Rotherham Advertiser — All              | NEWS     | `https://www.rotherhamadvertiser.co.uk/rss/`                                 | native                       |
| Rotherham Advertiser — News             | NEWS     | `https://www.rotherhamadvertiser.co.uk/news/rss/`                            | native                       |
| Rotherham Advertiser — Sport            | SPORTS   | `https://www.rotherhamadvertiser.co.uk/sport/rss/`                           | native                       |
| Rotherham Advertiser — Rotherham United | SPORTS   | `https://www.rotherhamadvertiser.co.uk/sport/football/rotherham-united/rss/` | native                       |
| Rotherham Advertiser — What's On        | EVENTS   | `https://www.rotherhamadvertiser.co.uk/whats-on/rss/`                        | native                       |
| Rotherham Advertiser — Jobs             | JOBS     | `https://www.rotherhamadvertiser.co.uk/jobs/rss/`                            | native, low-volume           |
| Rotherham MBC — News                    | NEWS     | `https://www.rotherham.gov.uk/rss/news`                                      | native, official             |
| Rotherham MBC — Events                  | EVENTS   | `https://www.rotherham.gov.uk/rss/events`                                    | native, official             |
| The Star — News                         | NEWS     | `https://www.thestar.co.uk/news/rss`                                         | **regional**                 |
| The Star — Sport                        | SPORTS   | `https://www.thestar.co.uk/sport/rss`                                        | **regional**                 |
| The Star — Rotherham United             | SPORTS   | `https://www.thestar.co.uk/sport/football/rotherham-united/rss`              | native                       |
| YorkshireLive — Rotherham tag           | NEWS     | `https://www.examinerlive.co.uk/all-about/rotherham/?service=rss`            | native (examinerlive host)   |
| BBC News — South Yorkshire              | NEWS     | `https://feeds.bbci.co.uk/news/england/south_yorkshire/rss.xml`              | **regional**                 |
| Rother Radio                            | NEWS     | `https://www.rotherradio.co.uk/feed/`                                        | native                       |
| Rotherham College                       | NEWS     | `https://www.rotherham.ac.uk/feed/`                                          | native                       |
| Wentworth Woodhouse                     | EVENTS   | `https://wentworthwoodhouse.org.uk/feed/`                                    | native, low/uncertain volume |
| Reddit r/Rotherham                      | NEWS     | `https://www.reddit.com/r/rotherham/.rss`                                    | native, UGC (Atom)           |
| Reed — Rotherham jobs                   | JOBS     | `https://www.reed.co.uk/jobs/rss?keywords=&locationName=Rotherham`           | native                       |

> The Star — All (`/rss`, ~67 items) is intentionally **not** seeded: its content is fully
> covered by the News + Sport section feeds, so seeding it would only add duplicate ingest work
> and more regional noise to filter.

### HTML (Cheerio) — enabled

| Name                   | Vertical | URL                                                                | Notes                                                           |
| ---------------------- | -------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Rotherham MBC — Jobs   | JOBS     | `https://www.rotherham.gov.uk/jobs`                                | server-rendered list; CSS selectors in `config`                 |
| Eventbrite — Rotherham | EVENTS   | `https://www.eventbrite.co.uk/d/united-kingdom--rotherham/events/` | server-rendered cards; verify selectors, watch for markup drift |

### Seeded but `disabled` (need Playwright — Phase 1b)

| Name                                  | Vertical | URL                                                                   | Why disabled                                                                        |
| ------------------------------------- | -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Rotherham United (Millers) — official | SPORTS   | `https://www.themillers.co.uk/news/`                                  | JS-rendered app, no SSR RSS. Covered meanwhile by the Advertiser + Star RUFC feeds. |
| NHS Jobs — Rotherham                  | JOBS     | `https://www.jobs.nhs.uk/candidate/search/results?location=Rotherham` | New NHS Jobs site dropped RSS; JS-heavy results.                                    |

**Explicitly excluded** (documented so we don't re-litigate): Rother FM (closed 2020),
Redroad FM (abandoned since 2015), Magna / South Yorkshire Police / CV-Library (Cloudflare/WAF
403 to plain fetch — revisit with Playwright if wanted).

## Target shape

```
packages/
├─ core/                    # @rovrum/core — domain logic, no I/O
│  └─ src/
│     ├─ normalize.ts       #   raw adapter item → ContentItem input
│     ├─ content-hash.ts    #   stable dedup hash
│     ├─ relevance.ts       #   Rotherham keyword filter (regional sources)
│     └─ index.ts
└─ sources/                 # @rovrum/sources — one adapter per source *type*
   └─ src/
      ├─ adapter.ts         #   SourceAdapter interface + FetchedItem type
      ├─ rss.ts             #   RSS/Atom adapter (rss-parser)
      ├─ html.ts            #   Cheerio adapter (config-driven selectors)
      ├─ registry.ts        #   type -> adapter lookup
      ├─ seed-data.ts       #   the verified registry above, as data
      └─ index.ts
apps/
└─ workers/                 # @rovrum/workers — the standalone Dockerised worker
   └─ src/
      ├─ boss.ts            #   pg-boss init/start, queue + schedule setup
      ├─ ingest.ts          #   the ingest job handler (one run per source)
      ├─ scheduler.ts       #   enqueue due sources by cadence
      ├─ index.ts           #   entrypoint: start boss, register work, keep alive
      └─ seed.ts            #   upsert seed-data into `sources` (idempotent)
infra/
└─ Dockerfile.workers      # containerise the worker (portability principle)
```

**Boundary discipline** (`ARCHITECTURE.md` §1, load-bearing): `@rovrum/core` is pure — no
network, no DB — so it's unit-testable in isolation. `@rovrum/sources` does the fetching and
returns normalized-ish items but doesn't touch the DB. `apps/workers` is the only place that
orchestrates: fetch → normalize → dedup → persist → record the run.

## Approach

### 1. `@rovrum/core` — pure domain logic

- **`FetchedItem`** — the raw shape an adapter yields (title, link, excerpt/summary, author?,
  publishedAt?, imageUrl?, plus `raw` = the untouched source payload).
- **`normalize(source, item)`** → the `ContentItem` create input: map fields, carry `vertical`
  from the source, trim/clean excerpt (strip HTML to a plain snippet — **aggregator boundary:
  excerpt only, never full body**), resolve `canonicalUrl`, keep `raw` verbatim.
- **`contentHash(item)`** — stable SHA-256 over canonical URL (normalized: lowercased host,
  stripped tracking params/fragment) + title. This is the dedup key written to
  `ContentItem.contentHash` (already `@unique` in the schema). Deterministic and pure.
- **`isRotherhamRelevant(text)`** — case-insensitive match against a maintained keyword list
  (Rotherham + Maltby, Wath, Rawmarsh, Dinnington, Swinton, Kiveton, Thurcroft, Aston,
  Wickersley, Bramley, Brinsworth, Catcliffe, Thorpe Hesley, Wentworth, RUFC/Millers, …).
  Applied by the worker only to items from sources flagged `regional`.

### 2. `@rovrum/sources` — adapters

- **`SourceAdapter` interface**: `fetch(source: Source): Promise<FetchedItem[]>`. One adapter
  per **type** (`RSS`, `HTML`), selected via `registry.ts` from `source.type`.
- **RSS adapter** (`rss-parser`): fetch with a real browser `User-Agent` (several feeds 403 a
  bare client), parse RSS **and** Atom (Reddit is Atom), map entries → `FetchedItem`. Tolerate
  missing fields; skip malformed entries without failing the whole run.
- **HTML adapter** (`cheerio`): selectors come from `source.config` (e.g.
  `{ item, title, link, excerpt, image }`) so a new server-rendered source is a data change,
  not code. Resolve relative links against the source URL. Cheerio only — no JS execution
  (that's the deferred Playwright adapter).
- **`seed-data.ts`**: the registry table above as typed data (name, type, url, vertical,
  fetchCadence, enabled, config incl. `regional` flag and HTML selectors).

### 3. `apps/workers` — the pg-boss worker

- **`boss.ts`**: `new PgBoss(DATABASE_URL)`, `boss.on('error', …)`, `boss.start()`. Create an
  `ingest` queue with `{ retryLimit: 3, retryBackoff: true, retryDelay: 30 }` and a
  `dead-letter` queue for exhausted jobs.
- **`ingest.ts`** — the job handler `async ([job]) => …`, `job.data = { sourceId }`. Per run:
  1. open an `IngestRun` (`RUNNING`);
  2. load the `Source`, pick the adapter, `fetch`;
  3. `normalize` each item; if source is `regional`, drop items failing
     `isRotherhamRelevant`;
  4. compute `contentHash`; **`createMany` with `skipDuplicates`** on the unique hash (dedup is
     a DB invariant, not a race-prone read-then-write);
  5. close the `IngestRun` (`SUCCESS`/`FAILED`) with `itemsFound`, `itemsNew`, `error?`, and a
     `stats` blob (dropped-as-irrelevant count, skipped-malformed count); update
     `Source.lastFetchedAt`.
     Errors are caught per source so one bad feed never sinks the worker.
- **`scheduler.ts` + `boss.schedule`**: a single cron (e.g. every 5 min) runs a dispatcher that
  finds `enabled` sources whose `lastFetchedAt` is older than `fetchCadence` and enqueues one
  `ingest` job per source. Cadence lives in data, so tuning a source is a DB edit. (Cadence-per-
  source via one dispatcher tick keeps us to a single schedule; revisit only if that's too coarse.)
- **`index.ts`**: entrypoint — start boss, register the worker with sane `localConcurrency`
  (e.g. 4; we're rate-limited by politeness, not throughput), install the schedule, handle
  `SIGTERM`/`SIGINT` for clean shutdown, keep the process alive.
- **`seed.ts`**: idempotent `upsert` of `seed-data` into `sources` (match on URL). Run once via
  `pnpm --filter @rovrum/workers seed`.

### 4. Wiring & infra

- Turbo/workspace: new packages inherit `@rovrum/tsconfig` + `@rovrum/eslint-config`; add to
  the pnpm workspace (already `packages/*`, `apps/*`). Deps: `@rovrum/core` and `@rovrum/db`
  consumed via `workspace:*`.
- New deps: `rss-parser`, `cheerio`, `pg-boss` (+ types as needed). Keep them in the package
  that uses them.
- **`infra/Dockerfile.workers`** — containerise the worker (the "portable by default"
  principle: the worker must run as a plain container anywhere). Add a `workers` service to
  `docker-compose.yml`, depending on healthy Postgres, so `docker compose up` runs the whole
  pipeline locally.
- `.env.example`: the worker reuses `DATABASE_URL`; add `INGEST_USER_AGENT` (default browser-ish
  UA) and optional `INGEST_DISPATCH_CRON`.

## Testing (test-first, per dev-workflow)

Each acceptance criterion becomes a failing test first. Behaviour, not implementation.

- **`@rovrum/core` (unit, no I/O — the high-value tests):**
  - `contentHash` is stable across runs and identical for URLs differing only by tracking
    params/fragment/case; differs when title or real URL differs.
  - `normalize` maps a representative RSS entry and an Atom entry correctly; strips HTML from
    excerpt; preserves `raw`; never emits full-body content.
  - `isRotherhamRelevant` matches on town/area keywords and rejects clearly non-Rotherham text.
- **`@rovrum/sources` (unit against fixtures — no live network in tests):**
  - RSS adapter parses real captured fixtures (Advertiser RSS, council RSS, Reddit **Atom**,
    Reed jobs) into `FetchedItem[]`; tolerates a malformed entry.
  - HTML adapter extracts items from a captured council-jobs / Eventbrite HTML fixture using
    config selectors; resolves relative URLs.
- **Worker (integration, against the compose Postgres):**
  - Ingest handler run twice over the same fixture yields `itemsNew` the first time and **0 new
    the second** (dedup via unique hash holds); an `IngestRun` row is written with correct
    counts; a `regional` source drops off-topic items and records the drop count in `stats`.
- Live feeds are **not** hit in CI — capture fixtures once; a separate, non-CI
  `pnpm --filter @rovrum/sources verify:live` smoke-checks the real URLs on demand.

## Verification (the milestone)

1. `pnpm install` clean; `pnpm check-types`, `pnpm lint`, `pnpm test` green across the workspace.
2. `docker compose -f infra/docker-compose.yml up -d` (Postgres + MinIO healthy).
3. `pnpm db:migrate` (no schema change expected this phase — flag it in review if one appears),
   then `pnpm --filter @rovrum/workers seed` → `sources` table holds the seeded registry
   (enabled RSS + HTML rows, Playwright rows `disabled`).
4. Start the worker; let the dispatcher tick.
5. **`pnpm db:studio`** — the payoff: `content_items` fills with real, deduplicated,
   Rotherham-relevant items across NEWS/SPORTS/EVENTS/JOBS; `ingest_runs` shows per-source runs
   with sane `itemsFound`/`itemsNew`; a second tick adds few/zero dupes. This is the phase's
   acceptance gate — a human eyeballs data quality here.
6. `docker compose up` including the `workers` service runs the whole pipeline in containers
   (portability check).

## Out of scope (explicit — follow-up tickets)

- **Playwright adapter** for JS-rendered sources (RUFC/Millers, NHS Jobs) → **Phase 1b**.
- Full-text search / `pgvector` semantic dedup (`ARCHITECTURE.md` §7) — current dedup is exact
  hash only; near-duplicate detection across sources is later.
- Any web/API surface (Phase 2), AI generation or social (Phase 3).
- Per-source rate-limit backpressure beyond pg-boss retries/backoff — revisit if a source
  complains.

## Landing (per docs/dev-workflow.md)

Branch off `main` (`feat/phase-1-ingestion`). Break this plan into GitHub issues (one per
package/unit, acceptance criteria = the tests above). Build task-by-task test-first, commit with
`Co-Authored-By`, open an `[ai-assisted]` PR referencing this plan, get CI green. **A human
reviews the diff against this plan and merges** — Claude never merges. Then tick Phase 1 on the
README roadmap.
