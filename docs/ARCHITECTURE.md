# Rotherham.town — Architecture & Stack Decision Record

> **Status:** Proposal agreed, pre-build (Phase 0 not yet started)
> **Domain:** https://www.rotherham.town
> **Last updated:** 2026-07-04

---

## 1. What we're building

**The place for everything Rotherham** — a content platform that aggregates news, sports, events, jobs (and more later) from many sources, surfaces them on a website and eventually a mobile app, and auto-generates social media content so the whole thing runs with minimal manual effort.

The **data pipeline is the product**; the website and app are just views onto it.

### Product decisions made
| Decision | Choice | Notes |
|---|---|---|
| **Content strategy** | **Link + snippet (aggregator)** | Store headline, excerpt, source attribution, canonical link. Link out to the original. Never rehost full third-party content. Lowest legal risk (Google-News-style). Social posts summarise + link. |
| **First milestone** | **Data pipeline first** | Build the scraping / normalization / storage backbone, verify data quality (via Prisma Studio), *then* build views on top. |
| **Portability** | **Fully portable, day one** | Everything runs as plain Docker containers. Vercel/any host is a deploy *target*, never a dependency. |
| **AI provider** | **Provider-agnostic layer** | Abstract behind an interface; swap Claude / OpenAI / local per task by cost/quality. |
| **Social targets** | **X/Twitter, Facebook/Instagram, LinkedIn, TikTok** | TikTok ⇒ the content model must carry **video**, not just text/image. Meta/IG ⇒ needs an image per post. Content model carries per-platform variants. |

### About the author (context for decisions)
- Senior full-stack dev, ~20 years, JavaScript/TypeScript focus.
- **Basic SQL knowledge** (drove the ORM choice → Prisma).
- Wants **low-admin / highly automated** ("I don't really want to do anything").
- Cost-minimal hosting, but must be able to **move hosts** if required.

---

## 2. Final stack

> **pnpm + Turborepo · Astro · PostgreSQL + Prisma · pg-boss · Dockerised Node workers · Cheerio/RSS + Playwright-when-needed · provider-agnostic AI · Cloudflare R2 storage · Expo mobile (later) · Vercel/Cloudflare + Railway/Fly hosting**

| Concern | Choice | Why / portability note |
|---|---|---|
| **Language** | TypeScript everywhere | One language across web, app, workers, scripts. |
| **Monorepo** | pnpm workspaces + Turborepo | Shares the data model + AI layer between web, app, workers. No lock-in. |
| **Web** | **Astro** | Content-first, SEO-critical (a local-news site lives on Google traffic). Islands for the few interactive bits (e.g. social approval queue). |
| **Mobile app** | Expo / React Native *(later phase)* | Shares TS types + API client. |
| **DB** | **PostgreSQL** (Neon/Supabase to start, portable to any Postgres) | Plain Postgres = max portability. Full-text search built in; add `pgvector` later for dedup/semantic. |
| **ORM / migrations** | **Prisma** | Schema-first DX suits basic-SQL comfort. **Prisma Studio** is a great GUI for reviewing scraped-data quality. Drop to raw SQL for the rare Postgres-specific bit. |
| **Ingestion workers** | Standalone Node processes (not serverless) | Scraping needs long-running, retry-friendly, portable execution. Runs in Docker anywhere. |
| **Queue / scheduling** | **pg-boss** (job queue on Postgres) | Retries, backoff, cron, concurrency, dead-letter — all on the Postgres we already run. No Redis to host/back up/pay for. Job volume is tiny, so BullMQ's throughput edge isn't needed yet. |
| **Scraping** | `undici`/`fetch` + Cheerio (HTML); RSS/Atom parser; Playwright only when a source needs JS rendering | Cost order: official feeds/APIs > RSS > HTML scrape > headless browser. |
| **AI layer** | Thin `@rotherham/ai` package with a `Provider` interface | Claude/OpenAI/local behind one API; pick per-task. |
| **Object storage** | **Cloudflare R2** (S3-compatible) | Zero egress fees (matters for serving generated images/video). Portable — swap endpoint for real S3 or self-hosted MinIO anytime. |
| **Deploy** | Docker images; web on Vercel/Cloudflare, workers + Postgres on Railway/Fly | Move hosts = repoint deploy, not a rewrite. |

### Key non-obvious decisions
- **Scrapers/scheduler are NOT serverless cron functions.** They're long-running, stateful, rate-limited jobs → Dockerised workers + pg-boss. Keeps us genuinely portable and far easier to debug. The web app can still live on Vercel/Cloudflare.
- **The web framework is disposable.** All real logic (ingestion, data model, AI, social publishing) lives in shared packages + standalone workers, independent of Astro. If the interactive surface ever outgrows Astro, swap the web app; the engine underneath is untouched.

---

## 3. Decision log (what changed and why)

These were debated and reversed from the first proposal — recorded so we don't re-litigate.

| Decision | First proposed | Final | Why it changed |
|---|---|---|---|
| **Queue** | BullMQ + Redis | **pg-boss** | Tiny job volume; "portable + cost-minimal + solo dev" argue against a second stateful service. pg-boss gives retries/backoff/cron/concurrency on existing Postgres. Reverse later only if volume hits thousands/min. |
| **ORM** | Drizzle | **Prisma** | Original argument assumed strong SQL. Author has *basic* SQL → schema-first DX + Prisma Studio (great for the data-quality-review milestone) win. |
| **Web** | Next.js | **Astro** | Author leans "no admin dashboard"; project is 90% SEO content pages. Astro is purpose-built for that. Low risk because the web app is just a view over shared packages. |

### Caveats flagged for later
- **Mobile app will need an API.** Likely a small dedicated API — Astro server endpoints or a tiny separate API service in the monorepo. Clean either way because logic is in shared packages, not the web app.
- **Full-text search + dedup** need some Postgres-specific power. Prisma covers most; drop to raw SQL for the rest.
- **Social auto-posting should start with a human-approval queue**, not fully unsupervised — an LLM posting to the brand's accounts on day one is risky. Full automation once trusted.

---

## 4. Monorepo shape

```
rotherham/
├─ apps/
│  ├─ web/            # Astro — public site (Phase 2)
│  ├─ workers/        # ingestion + social scheduler (Phase 1) ← built first
│  └─ mobile/         # Expo app (Phase 4)
├─ packages/
│  ├─ db/             # Prisma schema + migrations + client (Phase 0) ← foundation
│  ├─ core/           # domain types, normalization, dedup (Phase 0/1)
│  ├─ sources/        # one adapter per source (RSS/HTML/API) (Phase 1)
│  ├─ ai/             # provider-agnostic content generation (Phase 3)
│  └─ social/         # per-platform publishers (Phase 3)
└─ infra/             # docker-compose (postgres, minio), Dockerfiles
```

---

## 5. Core data model (the heart of it)

A **source-agnostic `content_item`** — every source adapter normalizes into this shape:

- `id`, `source_id`, `vertical` (news | sports | events | jobs)
- `title`, `excerpt`, `canonical_url`, `image_url`, `author`, `published_at`
- `content_hash` (for dedup), `location` (Rotherham-relevance geo/tags)
- `raw` (jsonb — original payload, so we never lose data)
- vertical-specific extensions: `event_details` (date/venue), `job_details` (salary/employer), etc.

Supporting tables:
- **`sources`** — registry of feeds + config + fetch cadence.
- **`social_posts`** — generated drafts → scheduled → published, with per-platform variants (text/image/video).
- **`ingest_runs`** — observability: what ran, what it found, what failed.

---

## 6. Phased plan

| Phase | Name | Scope |
|---|---|---|
| **0** | **Foundation** *(start here)* | Monorepo scaffold · `infra/docker-compose` (Postgres + MinIO) · `@rotherham/db` Prisma schema (content model) + first migration · CLAUDE.md + dev-workflow + Claude Code guardrails. |
| **1** | **Ingestion** | `@rotherham/sources` adapter interface + 3–5 real Rotherham sources (RSS first) · pg-boss scheduler in `apps/workers` · dedup · `ingest_runs` observability. **← "data pipeline first" milestone: verify data quality in Prisma Studio here.** |
| **2** | **Web MVP** | Astro site reading the DB · News vertical end-to-end · then sports/events/jobs. |
| **3** | **AI + Social** | `@rotherham/ai` + `@rotherham/social` · generate + schedule posts · **human-approval queue** before full automation. |
| **4** | **Mobile** | Expo app on the shared API/types. |
| — | **Branding** | Runs alongside (currently no branding). Can generate a starter identity (name treatment, palette, logo direction) when wanted — not blocking. |

---

## 7. Open questions / to decide later
- Which specific Rotherham sources to start with (RSS feeds, council site, RUFC, local job boards, events listings).
- Concrete hosts (Vercel vs Cloudflare Pages for web; Railway vs Fly for workers/DB).
- Which AI provider to wire in first for content generation (interface is provider-agnostic).
- Branding / visual identity.
- Video generation approach for TikTok (later — most complex output type).
