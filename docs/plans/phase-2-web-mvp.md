# Phase 2 — Web MVP (News vertical)

> **Status:** Draft for review — no code until a human approves this plan.
> **Depends on:** Phase 1 (ingestion) — `content_items` populated with NEWS items.
> **Scope this plan:** News vertical **end-to-end only**. Sports / events / jobs are
> deferred to follow-up tickets (they reuse everything built here).
> **Architecture ref:** `docs/ARCHITECTURE.md` §6 (Phase 2), §2 (stack), §5 (data model).

---

## 1. Goal & shape

Stand up `apps/web` — an **Astro** site that renders the News vertical from the
existing Postgres DB, following the agreed stack and load-bearing principles:

- **The web app is a disposable view.** It reads the shared `@rovrum/db` client and
  reuses `@rovrum/core` for any formatting/relevance logic. No ingestion, no business
  logic baked into the web app.
- **Aggregator, not a rehost.** Cards show headline + excerpt + source attribution +
  image, and **link out** to `canonicalUrl`. We never render full third-party content
  and never make our article route the destination — every card's primary link is the
  original source.

### Decisions locked with the author (2026-07-09)

| Decision | Choice | Consequence for this plan |
|---|---|---|
| **Rendering** | **SSG + scheduled rebuilds** | `output: 'static'` (Astro default). Pages query Prisma at **build time** via top-level `await` / `getStaticPaths()`. No live DB connection from the web host. Freshness = last rebuild. |
| **Holding page** | **Keep at root** | The holding page (`public/index.html`) stays live at `/`. The app ships under a **subpath** (proposed `/news`) until more verticals justify taking the root. |
| **Breadth** | **News only** | Build News fully; defer other verticals. |

---

## 2. Where the app lives & how it deploys (the one non-obvious bit)

Today `vercel.json` serves the repo's `public/` directory statically (the holding
page). We must add a static Astro build **without evicting the holding page from `/`**.

**Approach:** Astro builds with `base: '/news'` and `output: 'static'`, producing a
self-contained static bundle under `/news/*`. Deploy config routes `/news/*` to the
Astro build output and leaves `/` → the existing holding page untouched.

- Astro config: `base: '/news'`, `outDir` set so the build lands in a predictable
  folder; `site: 'https://www.rovrum.town'` for correct canonical/OG URLs and sitemap.
- All internal links/asset URLs go through `import.meta.env.BASE_URL` (Astro rewrites
  them) — never hardcode `/news`.
- Deploy: Vercel builds the monorepo; the web project's output dir is the Astro
  `dist`, and the holding page remains a separate static asset at root. **Exact Vercel
  wiring (single project with rewrites vs. two projects) is an open item — see §9.**
  Nothing about the app's code depends on which we pick.

> Rebuild trigger (making SSG content fresh) is **out of scope for the first ticket** —
> a manual/redeploy is fine to prove the vertical. Automating rebuild-after-ingestion
> (deploy hook fired by the workers, or a scheduled rebuild) is a **follow-up ticket**
> (§8) so we don't couple the first web ship to worker changes.

---

## 3. Package/workspace setup

`apps/web` — a new workspace package `@rovrum/web`:

- Astro (latest), TypeScript strict (inherits `@rovrum/tsconfig`), ESLint via
  `@rovrum/eslint-config`, Prettier from root.
- Dependencies: `@rovrum/db` (`workspace:*`) for the Prisma client and generated
  types; `@rovrum/core` (`workspace:*`) if we need shared formatting/relevance.
- Scripts wired into Turborepo: `build` (`astro build`, depends on `^build` so
  `@rovrum/db` is built and the client generated first), `dev` (`astro dev`),
  `check-types` (`astro check` / `tsc --noEmit`), `lint`, `test`.
- `turbo.json`: the existing `build` task already runs `^build` and picks up `dist/**`
  — confirm Astro's output dir is covered; add web-specific `outputs` if needed.

**Build-time DB access:** page frontmatter imports `{ prisma }` from `@rovrum/db` and
queries at build. Requires `DATABASE_URL` present in the build environment (local
`.env`, and the deploy env). This is the same client the workers use — no new DB code.

---

## 4. Data access layer (`src/lib`)

Keep pages thin; put queries in a small typed data module so they're testable without
a browser:

- `getLatestNews({ limit, cursor? })` → newest NEWS `content_items` (order by
  `publishedAt` desc, nulls last; `id` tiebreak), joined to `source` for attribution.
- `getNewsItemById(id)` → single item for the (optional) detail route.
- Returns narrow view types (only fields the UI needs), not raw Prisma rows, so the
  template never leaks `raw`/`jsonb` internals.

All reads filter `vertical = NEWS` and `enabled`/valid sources. No writes anywhere in
the web app.

---

## 5. Pages & components (News end-to-end)

Routes (all under `base: /news`):

1. **`/news` — the feed (home of the vertical).** Paginated list of the latest News
   items as cards. This is the primary surface.
2. **`/news/[id]` — item detail (thin).** *Decide during review whether we need this
   at all.* Because we're an aggregator, the honest default is that a card links
   **straight to the source** and there is **no** on-site detail page. Recommendation:
   **ship without a detail route first**; add one later only if there's a product
   reason (e.g. a "related items" view). Listed here so the decision is explicit.
3. **`404`** styled to match.

Components:

- `ArticleCard` — headline (links to `canonicalUrl`, `rel="noopener"`,
  `target` per review), excerpt, source name, relative published time, optional image
  (`imageUrl`) with graceful fallback when null.
- `SourceBadge` / attribution line — makes the "links out to original source" boundary
  visually obvious.
- `Layout` — base HTML shell: brand fonts (Bitter/Inter via Bunny Fonts), the palette
  from `brand/BRAND.md` as CSS custom properties, header/footer. **Reuse the holding
  page's CSS variables and type setup** as the visual starting point so the app is
  on-brand from day one.
- `Pagination` — prev/next over the feed.

Content rules enforced in the template:
- Only headline + excerpt + attribution + link. **No full-content field is rendered**
  (the model doesn't even store it — but assert it in review).
- Every card's headline/CTA points at `canonicalUrl`.

---

## 6. SEO (a local-news site lives on Google traffic — §2 of the ADR)

- `site` set so canonical + OG URLs are absolute and correct.
- Per-page `<title>`/`<meta description>`, Open Graph + Twitter card tags (reuse the
  holding page's OG setup as the pattern).
- `@astrojs/sitemap` generating a sitemap for the News routes; `robots.txt`.
- Semantic HTML, one `<h1>` per page, accessible landmarks, `lang="en-GB"`.
- Canonical link tags on feed pages; **card links carry source attribution** — we are
  explicitly *not* trying to rank on rehosted content (there is none).

---

## 7. Testing (test-first, per dev-workflow §Build)

Each acceptance criterion becomes a failing test first. Vitest (already the repo's
test runner via the `test` script + guard hook).

- **Data layer (unit):** `getLatestNews` filters to NEWS, orders by `publishedAt`
  desc, respects `limit`, and shapes rows to the view type. Use a test DB or mock the
  Prisma client — **decide the approach in review** (lean: mock the client for pure
  query-shaping tests; a seeded test DB for an integration smoke test).
- **Rendering (component):** Astro container API / render tests that assert an
  `ArticleCard` links to `canonicalUrl`, shows source attribution, and renders **no**
  full-content field; that a null `imageUrl` degrades gracefully.
- **Boundary test (load-bearing):** a test that fails if a card's primary link is ever
  the internal route instead of the source `canonicalUrl` — encodes the aggregator
  boundary as a contract.
- **Build smoke:** `astro build` succeeds against a seeded DB and emits the expected
  `/news` routes.

Gates before PR (dev-workflow §Ship): `pnpm lint`, `pnpm check-types`
(`tsc --noEmit` / `astro check`), `pnpm test` all green; CI green before review.

---

## 8. Ticket breakdown (one issue each; acceptance criteria = test contract)

1. **web-scaffold** — `apps/web` Astro package wired into pnpm/Turbo, `base:/news`,
   `output:static`, brand layout shell, builds green and deploys a placeholder `/news`
   page alongside the untouched holding page.
2. **web-data-layer** — `src/lib` News queries against `@rovrum/db`, view types, unit
   tests. No UI.
3. **web-news-feed** — `/news` feed page + `ArticleCard` + attribution + pagination,
   reading the data layer. Component/boundary tests.
4. **web-seo** — titles/meta/OG per page, sitemap, robots, canonical. 
5. **web-rebuild-trigger** *(follow-up, may slip past MVP)* — automate
   rebuild-after-ingestion (deploy hook or scheduled rebuild) so SSG content stays
   fresh without a manual redeploy.

Deferred to their own phase-2 follow-up plans: **sports**, **events** (uses
`eventDetails`), **jobs** (uses `jobDetails`) verticals. Each is "copy the News
vertical, swap the query + card fields."

---

## 9. Open items for the reviewer to settle

- **Vercel wiring:** one project with rewrites (`/news/*` → app, `/` → holding page)
  vs. two projects on one domain. Preference?
- **Detail route:** ship with **no** on-site item page (pure link-out, recommended),
  or include a thin `/news/[id]`?
- **Freshness for MVP:** manual redeploy acceptable for first ship (recommended), or is
  the rebuild trigger (ticket 5) a launch blocker?
- **Test DB vs. mock:** mock the Prisma client for query-shaping tests, or stand up a
  seeded test DB for an integration test in CI?
- **Subpath now, root later:** confirm `/news` as the subpath (vs. e.g. a `news.`
  subdomain), and note the intended trigger for the app eventually taking `/`.

---

## 10. Non-goals (guarding against scope drift)

- No CMS / authoring, no admin dashboard (ADR scope boundaries).
- No live per-request DB queries from the edge (SSG decision).
- No AI / social features (Phase 3).
- No mobile app / public API (Phase 4).
- No rehosting of full article content — ever.
