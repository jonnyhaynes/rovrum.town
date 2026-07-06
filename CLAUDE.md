# Claude Code context for Rovrum

This file orients Claude Code on this repo. Keep it lean -- it points, it doesn't
explain. Substantive design and rationale live in `/docs`; read those before any
non-trivial change. A bloated CLAUDE.md is a smell: if a section wants more than a
few lines, move it to its own doc under `/docs` and link it.

## What this is

The place for everything Rotherham — a content platform that aggregates news, sports, events and jobs from many local sources into one feed, with a data pipeline as the product and web/mobile as views onto it.

See `README.md` for status and `docs/dev-workflow.md` for how we build here.

## Stack

**TypeScript everywhere**, in a **pnpm workspaces + Turborepo** monorepo. Web is
**Astro**; ingestion/social run as **standalone Dockerised Node workers** (not
serverless); DB is **PostgreSQL via Prisma**; the job queue is **pg-boss** (on
Postgres, no Redis); object storage is **Cloudflare R2** (S3-compatible); the AI
layer is **provider-agnostic**. Mobile (Expo) comes later. Strict TypeScript (avoid
`any`). Tests run through the project's `test` script; lint with ESLint, format with
Prettier, type-check with `tsc --noEmit`.

> **Status: Phase 0 done.** The pnpm + Turborepo monorepo is scaffolded:
> `packages/db` (`@rovrum/db` — Prisma schema for the content model + first migration),
> shared config in `packages/{tsconfig,eslint-config}`, and `infra/docker-compose.yml`
> (Postgres + MinIO). The live holding page (`public/`, `vercel.json`) is still separate
> and untouched — `apps/web` (Astro) is Phase 2. See `docs/ARCHITECTURE.md` for the full
> plan and the target shape (`apps/{web,workers,mobile}`, `packages/{db,core,sources,ai,social}`).
>
> **Local dev:** `docker compose -f infra/docker-compose.yml up -d`, copy `.env.example`
> → `.env`, then `pnpm install && pnpm db:generate && pnpm db:migrate`. See `infra/README.md`.

## Load-bearing principles

These shape the schema and the code. Don't change them without checking
`docs/ARCHITECTURE.md` first.

- **The data pipeline is the product.** The website and app are just views onto it.
  All real logic (ingestion, data model, AI, social) lives in shared `packages/*` and
  standalone workers — never baked into the web app. The web framework is disposable.
- **Aggregator, not a rehost.** Store only headline, excerpt, source attribution, and
  a canonical link; link out to the original. Never store or serve full third-party
  article content. This is the load-bearing legal boundary.
- **Portable by default.** Everything runs as plain Docker containers. Any host is a
  deploy *target*, never a dependency. No hard lock-in to a specific vendor's runtime.
- **One source-agnostic content model.** Every source adapter normalizes into the
  shared `content_item` shape (keep `raw` jsonb so we never lose original payload).
  The content model carries per-platform social variants (text/image/**video** for TikTok).
- **AI is provider-agnostic.** Everything goes through the `@rovrum/ai` `Provider`
  interface — no direct provider SDK calls scattered through the code.
- **Social posting is human-approved first.** Generated posts go through an approval
  queue before publishing; no unsupervised posting to the brand's accounts on day one.

## Scope boundaries

What this project is **not**, and shouldn't drift towards. If a request would drift
here, push back before building.

- **Not a CMS or a place people author content.** It aggregates and links out; it
  isn't a publishing tool for original articles.
- **Not an admin-heavy dashboard product.** The goal is low-admin / highly automated.
  The only real interactive surface is the social-approval queue.
- **Ingestion is not serverless cron.** Scrapers/scheduler are long-running, stateful,
  rate-limited Dockerised workers on pg-boss — don't reach for serverless cron functions.
- **Don't add a second stateful service (e.g. Redis) without a deliberate decision.**
  pg-boss on the existing Postgres is the queue until job volume genuinely demands more.
- **Rotherham-focused.** Not a general-purpose national news aggregator.

## How we work (the short version)

Full process: `docs/dev-workflow.md`. The non-negotiables:

- **Plan first.** For non-trivial work, produce an implementation plan saved to
  `docs/plans/<ticket>.md` and have a human approve it before writing code. The
  plan is what gets reviewed, not the first code.
- **A human reviews and merges every PR.** Claude opens the PR and gets CI green; a
  named person reviews the diff against the plan and merges. Claude never merges.
- **Never put secrets, credentials, or client data into the model.** If unsure,
  it's out of bounds until you've asked.
- **Mark AI-assisted work.** Prefix AI-assisted PR titles `[ai-assisted]`, reference
  the approved plan doc, and end the description with a `Manually reviewed by <name>`
  line. Keep the `Co-Authored-By` trailer on commits.

## Documents

Source of truth lives in `/docs`. Read the relevant doc before responding:

- `docs/ARCHITECTURE.md` -- the stack/architecture decision record, data model, and phased plan (read this before any non-trivial change)
- `docs/dev-workflow.md` -- how we build (the loop + standing conventions)
- `docs/plans/` -- approved implementation plans, one per unit of work
- _Add requirements and policy docs here as they appear._

## Working style

- Push back where appropriate rather than agreeing reflexively.
- When changing a load-bearing principle or scope boundary, flag it explicitly
  rather than slipping it in.
- Prefer pointing at a doc section over reproducing its content here.

## Raising pull requests

This project uses **GitHub**. Raise PRs with the `gh` CLI (or the REST API):

- Repo: `jonnyhaynes/rovrum.town` · Target branch: `main`.
- Push the branch (`git push -u origin <branch>`), then `gh pr create`.
- **Mark AI-assisted PRs:** prefix the title `[ai-assisted]` (or add an `ai-assisted`
  label), reference the approved plan doc (`docs/plans/<ticket>.md`) in the body, and
  end it with a `Manually reviewed by <name>` line confirming the diff was read.
- Keep the `Co-Authored-By` trailer on commits. **A human merges** once CI is green
  and the diff has been reviewed against the plan.
**Issue tracker: GitHub Issues.** One issue = one unit of work; acceptance criteria
are the test contract. Reference the issue in the branch name and PR, and close it from
the PR (`Closes #NN`) once merged.
