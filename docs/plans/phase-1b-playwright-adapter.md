# Phase 1b · Playwright adapter + the last disabled sources

**Status:** approved 2026-07-09 — decisions locked: Docker → **Chromium into the current
`node:22-slim` base** (option A); PR shape → **one PR, cheap wins (NHS+WW) as the first
commit**, then the Playwright adapter + Docker.
**Branch:** `feat/playwright-adapter` · relates to the Phase-1b follow-up (the 4 disabled/degraded sources).

## TL;DR

"Build the Playwright adapter" turned out to be four sources of very different cost.
Live recon (2026-07-09, verified independently) + a Millers API spike:

| Source | Verdict | Fix |
| --- | --- | --- |
| **NHS Jobs** | Fully server-rendered HTML | **Cheerio** — existing `HtmlAdapter`, no browser |
| **Wentworth Woodhouse** | UA bot-block, not JS | **UA + correct feed URL** (`/whats-on/feed/`) — existing `RssAdapter` |
| **Rotherham United (Millers)** | Client-rendered Nuxt; news API is AWS-Cognito-gated (spike hit `401`/`Missing Authentication Token`) | **Playwright** — no clean unauthenticated JSON path |
| **Rotherham MBC jobs (iTrent)** | Session-bound JS app shell, POST-driven results | **Playwright** — the genuine headless-browser case |

So: **2 cheap non-browser wins** (ship immediately, low risk), and **1 real Playwright
adapter** serving **2 sources** (Millers + iTrent). The expensive part — putting a
browser in the container — is justified by two sources, not hypothetically by four.

## Findings (live, 2026-07-09)

### NHS Jobs — STATIC HTML (no browser)
`.../candidate/search/results?location=Rotherham` → HTTP 200, fully server-rendered
(NHS.UK design system). **10 results in the static HTML** (verified: 10
`data-test="search-result-job-title"`). "76 jobs found".
- Item: `li.nhsuk-list-panel.search-result` (a.k.a. `[data-test="search-result"]`).
- Title+link: `h2 a[data-test="search-result-job-title"]` — `href` = `/candidate/jobadvert/<REF>...` (prepend host).
- Salary: `li[data-test="search-result-salary"] strong`; closing date: `[data-test="search-result-closingDate"]`.
- Pagination: `?...&page=N`. Stable `data-test` hooks. → straight Cheerio.

### Wentworth Woodhouse — UA BLOCK (no browser)
- The 403 is a WordPress/WAF **User-Agent block**: same URL → 403 with default curl UA,
  **200 with a browser UA** (verified). Not an outage, not JS.
- The **site-wide `/feed/` is genuinely empty** (channel metadata, no `<item>`; events
  live in a custom post type). The **events feed `/whats-on/feed/`** returns **10 real
  `<item>` events** with a browser UA (verified). → point the existing RSS source at
  `/whats-on/feed/` and send a browser UA.

### Rotherham United (Millers) — PLAYWRIGHT (API spike failed)
- `/news/` is a **client-rendered Nuxt/GameChanger app**; no article data or reusable
  payload in static HTML (the `_payload.json` is a per-render stub).
- **Spike:** the app config exposes `VUE_APP_NEWSAPI = news.cms.admin.gc.rotherhamunitedfcservices.co.uk/v2`,
  `siteId=VODMUSHP`, and a static `APIKey`. Probing `/v2/news?siteId=VODMUSHP` returned
  **`401 Unauthorized`**; other shapes returned **`{"message":"Missing Authentication
  Token"}`** (AWS API Gateway). The API is **Cognito-gated** (`VUE_APP_AWS_*` identity
  pool). No clean, stable, unauthenticated JSON path — and baking a derived token in
  would be a fragile secret liability. **→ scrape the rendered DOM with Playwright.**
- Rendered scrape: `waitForSelector('.news-card')`, then per-card title/heading, anchor
  `href` (`/news/<slug>`), image, date. Dismiss the OneTrust consent banner if present.
  Selectors confirmed against the live rendered DOM at build time (nothing exists pre-JS).

### Rotherham MBC jobs (iTrent / WebiTrent) — PLAYWRIGHT
- 18 KB **app shell only**: an iTrent `<form id="ETREC179GF">` + a `FILTER` JSON of
  filter *options*, **no vacancies**. Results are injected client-side after a
  session-bound POST; the page carries `USESSION`/anti-resubmit tokens.
- Playwright flow: load the form, (optionally set Region → Rotherham `4860540osq`),
  submit "Find jobs", `waitForSelector` on the results list, click **"Show more
  results"** until exhausted, scrape rows. Row selectors read off the rendered DOM at
  build time. No consent wall on the shell.

## Plan

### 1. Cheap wins first (`packages/sources` + seed) — independently verifiable
- **NHS Jobs:** flip to enabled, keep `type: "HTML"`, add real `selectors` from the
  findings above. No adapter code change — proves the config against a live run.
- **Wentworth Woodhouse:** change its URL to `https://wentworthwoodhouse.org.uk/whats-on/feed/`.
  The worker already sends a configurable UA (`INGEST_USER_AGENT` / adapter `userAgent`),
  and the seeded default UA is a bot string — confirm a **browser-like UA** clears the
  403 in a live run; if the default bot UA is still blocked, set a browser UA as the
  worker default (it already defaults to a `RovrumBot` string). This is an RSS source,
  no new code.
- Capture fixtures: `nhs-jobs.html` (live) for a Cheerio selector unit test;
  `ww-whats-on.rss.xml` for an RSS parse test. CI drift guard, no network in tests.

### 2. The Playwright adapter (`packages/sources`)
- Add **`playwright`** (Chromium only) as a dependency of `@rovrum/sources`.
- New **`PlaywrightAdapter implements SourceAdapter`**. Config-driven, same shape as the
  others — the *mechanism* is source-agnostic, the *per-site recipe* is data in
  `config`:
  - `config.playwright.waitFor` — selector to await before scraping.
  - `config.playwright.consentClick?` — optional selector to dismiss a cookie banner.
  - `config.playwright.showMore?` — optional selector to click repeatedly (bounded, e.g.
    max N clicks) for "load more"/paged results.
  - `config.playwright.steps?` — optional ordered actions for iTrent (e.g. select Region,
    click submit) — a small typed action list, not arbitrary code.
  - `config.selectors` — reuse the existing `HtmlSelectors` (item/title/link/excerpt/image)
    to extract from the *rendered* DOM (via `page.$$eval` / Cheerio on `page.content()`).
- **Browser lifecycle (important):** `getAdapter` is called per-source inside a
  `batchSize: 4` concurrent batch, and launching Chromium per `fetch()` is expensive.
  Design: the adapter **accepts an injected `Browser`** (via `FetchDeps.browser?`) and
  creates a fresh **`context`+`page` per fetch**, closing them after. The worker owns one
  long-lived `Browser` (launched at boot, closed on SIGTERM) and passes it in. Tests
  inject a stub/`chromium` as needed. No browser is launched for RSS/HTML sources.
- Extend `registry.getAdapter` to return `PlaywrightAdapter` for the new type.

#### Rendered-DOM recon findings (2026-07-09, live browser)
- **Millers:** clean. Item `a.news-article` (17 cards), title `h3`, the card *is* the
  anchor (`/news/YYYY/month/DD/slug/` — real per-article URLs). `waitFor: a.news-article`;
  dismiss OneTrust consent if present. Rendered fixture captured for a CI test.
- **iTrent:** vacancies render on load (real jobs), BUT the deep probe found **no stable
  per-vacancy URL** — job links are `javascript:void(0)`, no job id / data-attr, the URL
  never changes on click, and results come from **session-bound JSON** (`etrecNNN.json?...
  &USESSION=<token>`). **Decision (locked): ingest anyway, using the search-results page
  URL as each item's `canonicalUrl`.** Trade-off accepted: all iTrent jobs link to the
  same generic listing (weak per-item linking).
  - **Dedup consequence:** `contentHash = sha256(canonicalUrl + title)`; with a shared URL
    this degrades to title-only dedup. Fine in practice (titles are distinct), but two
    distinct jobs with an identical title would collide and one be dropped — an accepted
    edge case, documented here.
  - iTrent recipe: item = the job-title container (`.Mhr-jobDetailTitleContainer`), title =
    `a.Mhr-jobDetailTitleLink`, link selector unused → the adapter falls back to the source
    URL when a row has no usable href.

### 3. Schema: new `PLAYWRIGHT` source type (`packages/db`)
- Add `PLAYWRIGHT` to the `SourceType` enum. Hand-authored migration (Prisma
  `migrate dev` needs an interactive TTY we don't have — same approach as Phase 1's
  `Source.url`/`vertical` migrations): `ALTER TYPE "SourceType" ADD VALUE 'PLAYWRIGHT';`
  (Postgres enum add; must be its own migration / not in a txn with usage).
- Widen the `type` unions in `adapter.ts` / `seed-data.ts` / `getAdapter` to include it.
- Re-type **Millers** and **iTrent council jobs** as `PLAYWRIGHT`, enabled, with their
  `config.playwright` recipes + selectors.

### 4. Containerisation (`infra`) — the load-bearing decision
The worker runtime is lean `node:22-slim` with **no browser and none of Chromium's
system libraries**. Options:
- **(A, recommended) Install Chromium + deps into the existing slim image** via
  `playwright install --with-deps chromium` in the builder, and carry the browser +
  libs into the runtime stage. Keeps our Debian/Prisma/OpenSSL base and the
  `pnpm deploy --prod` prune; adds ~300–400 MB. Must ensure the browser binary (installed
  outside `node_modules`, under `~/.cache/ms-playwright`) is **copied into the runtime
  stage** and that `PLAYWRIGHT_BROWSERS_PATH` is consistent between build and runtime —
  this is the main gotcha, analogous to the Prisma-engine copy we already do.
- **(B) Switch the base to `mcr.microsoft.com/playwright:v<ver>-jammy`.** Simplest for
  browsers, but abandons our tuned base (re-add Prisma/OpenSSL concerns) and is heavier
  (~1.5 GB). Rejected unless (A) proves painful.
- Either way: pin the Playwright version to the npm package version so the browser build
  matches. Run headless, single-process-friendly flags, `--no-sandbox` under the `node`
  user (documented trade-off for a container with no untrusted input).
- Verify the full pipeline **in-container** (compose `workers` service), not just on host.

### 5. Verify + re-enable
- Live run each newly-enabled source through the real `runIngest`; confirm sane
  per-source counts, canonical links, excerpts ≤ aggregator limit, dedup on re-run
  (0 new), and that failures are per-source (never crash the batch).
- Seed count becomes **all 22 enabled** (or note any that remain problematic).

## Acceptance criteria
- [ ] NHS Jobs enabled (Cheerio) — live run yields real Rotherham job listings.
- [ ] Wentworth Woodhouse re-pointed at `/whats-on/feed/` with a UA that clears the 403 —
      live run yields events.
- [ ] `PlaywrightAdapter` extracts Millers news + iTrent vacancies from the rendered DOM,
      with a single worker-owned browser (context/page per fetch), consent + show-more
      handled; per-source failures don't crash the batch.
- [ ] `PLAYWRIGHT` source type added (migration) and wired through registry/seed/types.
- [ ] Worker image ships Chromium and runs the browser sources **in-container**.
- [ ] Fixtures committed + unit tests (NHS Cheerio, WW RSS, and a Playwright extraction
      test against saved rendered HTML). CI stays network-free.
- [ ] Live verify: sane counts, dedup holds, no global junk.

## Out of scope / risks
- **Reverse-engineering the Millers Cognito token flow** — rejected (fragile, secret
  liability); DOM scrape instead.
- The **image size grows** materially (browser + libs). Acceptable for a background
  worker; called out so it's a decision, not a surprise.
- iTrent markup is brittle and session-bound; the `showMore` loop is bounded and the
  source degrades to "0 new, SUCCESS-with-warning" rather than crashing if selectors
  drift. A live-fixture test guards the parse step.
