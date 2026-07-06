# Phase 0 — Foundation: scaffold the Rovrum monorepo

## Context

Rovrum (rovrum.town) is a Rotherham content-aggregator platform whose **data pipeline
is the product**. The architecture is agreed (`docs/ARCHITECTURE.md`) but the build has
not started — today the repo is a static holding page (`public/index.html`, deployed via
`vercel.json`) plus docs and the agent-setup files just committed.

Phase 0 lays the foundation everything else sits on: the pnpm + Turborepo monorepo
skeleton, shared TS/lint config, local infra (`docker-compose` with Postgres + MinIO),
and the heart of the project — the `@rovrum/db` package holding the Prisma schema for the
source-agnostic content model, with a first migration. Per `ARCHITECTURE.md §6`, this is
explicitly the "start here" phase.

**Decisions locked with the user:**
- Full Phase 0 scope (skeleton + shared config + infra + real db schema + migration).
- **The live holding page is left completely untouched** — no `apps/web`, no changes to
  `public/index.html` or `vercel.json`. Astro web is Phase 2. Zero deploy risk.
- Packages this phase: `@rovrum/db` (real) + `@rovrum/tsconfig` + `@rovrum/eslint-config`.
  `core/sources/ai/social` are deferred to their phases.

**Environment:** Node v22.19.0, pnpm 10.33.0. `.gitignore` already anticipates the
monorepo (turbo/prisma/astro/expo/docker-data all covered). Current tooling: Turborepo
uses `turbo.json` with a `tasks` block; **Prisma uses the new `prisma-client` generator
(not `prisma-client-js`)** with a **required** custom `output` path.

## Approach

Convention: **npm-scope `@rovrum/*`**, workspace refs via `workspace:*` (pnpm). Turbo
task names: `build`, `lint`, `check-types`, `test`, `dev`. TypeScript strict everywhere.

### 1. Root workspace files

- **`package.json`** (root, `"private": true`): `packageManager: "pnpm@10.33.0"`,
  `engines.node: ">=22"`, scripts delegating to turbo (`build`/`lint`/`check-types`/
  `test`/`dev`), plus `db:*` passthroughs (see §5). Root devDeps: `turbo`, `typescript`,
  `prettier`, `@types/node`.
- **`pnpm-workspace.yaml`**: `packages: ["apps/*", "packages/*"]`.
- **`turbo.json`**: `$schema`, `tasks` for `build` (dependsOn `^build`), `lint`
  (dependsOn `^lint`), `check-types` (dependsOn `^check-types`), `test`, `dev`
  (`cache:false, persistent:true`). `db:generate` output-less task so client gen is
  cached/ordered ahead of consumers.
- **`.prettierrc`** and **`.npmrc`** (`auto-install-peers=true`, `strict-peer-dependencies=false`).
- **`.env.example`** (root): `DATABASE_URL`, MinIO/R2 vars (`S3_ENDPOINT`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`). `.gitignore` already keeps
  `.env` out and allows `.env.example`.

`public/`, `vercel.json`, `LICENSE`, `README.md`, `brand/` are **not touched**.

### 2. `packages/tsconfig` (`@rovrum/tsconfig`)

Shared TS presets so every package extends one source of truth.
- `package.json` (private, name `@rovrum/tsconfig`).
- `base.json` — strict, `noUncheckedIndexedAccess`, `module: NodeNext`,
  `moduleResolution: NodeNext`, `target: ES2022`, `declaration`, `isolatedModules`,
  `esModuleInterop`, `skipLibCheck`.
- `node.json` — extends base, `lib: ["ES2022"]`, for workers/packages.

### 3. `packages/eslint-config` (`@rovrum/eslint-config`)

Flat-config (ESLint 9) shared config: `package.json` exporting an `index.js` flat
config array (typescript-eslint recommended + prettier compat), consumed via
`eslint.config.js` in each package. DevDeps pinned here: `eslint`, `typescript-eslint`,
`eslint-config-prettier`.

### 4. `packages/db` (`@rovrum/db`) — the heart of Phase 0

Structure:
```
packages/db/
├─ package.json          # name @rovrum/db, exports ./client
├─ tsconfig.json         # extends @rovrum/tsconfig/node.json
├─ eslint.config.js
├─ prisma/
│  └─ schema.prisma      # generator + datasource + models
├─ src/
│  ├─ index.ts           # re-export PrismaClient singleton + generated types
│  └─ generated/         # prisma-client output (gitignored)
└─ .env -> uses root DATABASE_URL (documented; not committed)
```

- **`schema.prisma`**:
  - `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`
    (new provider, required output — per current Prisma docs).
  - `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`.
  - Models mapping `ARCHITECTURE.md §5` exactly:
    - **`ContentItem`** — `id`, `sourceId`+relation, `vertical` (enum
      `Vertical{ NEWS SPORTS EVENTS JOBS }`), `title`, `excerpt`, `canonicalUrl`,
      `imageUrl?`, `author?`, `publishedAt?`, `contentHash` (dedup, `@unique`),
      `location?`, `raw Json`, timestamps. Vertical extensions `eventDetails Json?`,
      `jobDetails Json?` (jsonb keeps Phase 0 lean; can normalize later).
      Indexes on `vertical`, `publishedAt`, `sourceId`.
    - **`Source`** — registry: `id`, `name`, `type` (enum `SourceType{ RSS HTML API }`),
      `url`, `config Json?`, `fetchCadence` (minutes), `enabled`, timestamps, relation to items.
    - **`SocialPost`** — `id`, `contentItemId?`+relation, `status` (enum
      `SocialPostStatus{ DRAFT SCHEDULED PUBLISHED FAILED }`), `variants Json`
      (per-platform text/image/**video**), `scheduledFor?`, `publishedAt?`, timestamps.
    - **`IngestRun`** — observability: `id`, `sourceId?`+relation, `startedAt`,
      `finishedAt?`, `status`, `itemsFound`, `itemsNew`, `error?`, `stats Json?`.
  - `@@map` snake_case table names (`content_items`, `sources`, `social_posts`,
    `ingest_runs`) to match the doc's SQL-style naming.
- **`src/index.ts`** — export a `PrismaClient` singleton (guarded against hot-reload dupes)
  and re-export generated types, so consumers do `import { prisma } from "@rovrum/db"`.
- **`package.json`** scripts: `db:generate` (prisma generate), `db:migrate`
  (prisma migrate dev), `db:studio`, `db:push`. DevDep `prisma`, dep `@prisma/client`.
- Add `src/generated/` to `.gitignore` (generated client is not committed).

### 5. Root db convenience scripts

Root `package.json` gets passthroughs filtering to the db package:
`db:generate`, `db:migrate`, `db:studio` → `pnpm --filter @rovrum/db <script>`.

### 6. `infra/` — local dev services

- **`infra/docker-compose.yml`**: `postgres:16` (named volume `docker-data`—already
  gitignored via `docker-data/`, healthcheck, port 5432, db `rovrum`), `minio` (console
  + API ports, `minio-data` volume), and a `createbuckets` one-shot to make the R2-stand-in
  bucket. Credentials pulled from env with dev defaults.
- **`infra/README.md`**: one-paragraph "how to bring infra up" (`docker compose -f
  infra/docker-compose.yml up -d`) and the `DATABASE_URL` / S3 vars to copy into `.env`.

### 7. Docs touch-up

- Update `README.md` roadmap: tick **Phase 0 — Foundation** once landed (leave unticked
  in the PR; a human ticks on merge, or tick and note it).
- `CLAUDE.md` currently says "monorepo isn't scaffolded yet (no package.json)". Update that
  note to reflect Phase 0 done and point at the real structure.

## Files created (representative)

```
package.json · pnpm-workspace.yaml · turbo.json · .prettierrc · .npmrc · .env.example
packages/tsconfig/{package.json,base.json,node.json}
packages/eslint-config/{package.json,index.js}
packages/db/{package.json,tsconfig.json,eslint.config.js,prisma/schema.prisma,src/index.ts}
infra/{docker-compose.yml,README.md}
```
Modified: `.gitignore` (add `packages/db/src/generated/`), `CLAUDE.md`, `README.md`.
**Untouched: `public/`, `vercel.json`, `brand/`, `LICENSE`.**

## Verification

1. `pnpm install` — resolves the workspace, no errors.
2. `docker compose -f infra/docker-compose.yml up -d` — Postgres + MinIO healthy
   (`docker compose ps` shows healthy; MinIO console reachable on its port).
3. Copy `.env.example` → `.env`, set `DATABASE_URL` to the compose Postgres.
4. `pnpm db:generate` — Prisma client generates into `packages/db/src/generated/`.
5. `pnpm db:migrate --name init` — first migration applies cleanly; a
   `packages/db/prisma/migrations/*_init/` folder is created.
6. `pnpm db:studio` — Prisma Studio opens and shows the four empty tables
   (the "verify data quality in Studio" workflow the doc calls out).
7. `pnpm check-types` and `pnpm lint` — green across the workspace via turbo.
8. Confirm the live site is unaffected: `git diff` shows no change to `public/` or
   `vercel.json`.

## Landing (per docs/dev-workflow.md)

Branch off `main` (e.g. `feat/phase-0-monorepo`), commit with `Co-Authored-By`, open an
`[ai-assisted]` PR referencing this plan, CI green, **a human reviews & merges**. This
plan file should be copied to `docs/plans/` as part of the work so the PR can reference it.
