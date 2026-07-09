# Phase 1b · Fix HTML scrapers (issue #9)

**Status:** approved 2026-07-09 — decisions locked: council jobs → **defer to Playwright**;
town list → **centralise in `@rovrum/core`**.
**Issue:** [#9](https://github.com/jonnyhaynes/rovrum.town/issues/9) · **Branch:** `fix/phase-1b-html-scrapers`

## TL;DR

Issue #9 reads as "fix two Cheerio selectors." Investigating the live pages
(2026-07-09) shows the two sources are **not the same kind of problem**, and one
of them can't be a Cheerio fix at all:

- **Eventbrite** — genuinely fixable now, but **not** by scraping card `<div>`s.
  The page ships a `<script type="application/ld+json">` `ItemList` with a clean
  per-event `location.address.addressLocality`. We should extract from that and
  filter to Rotherham-area localities. This kills the "global junk" problem at the
  source instead of hoping a keyword filter catches it.
- **Council jobs** — **cannot** be fixed with Cheerio. `rotherham.gov.uk/jobs` is a
  hub/landing page (links to category pages, not vacancies). The real vacancies live
  on a JS-rendered WebiTrent portal (`ce0351li.webitrent.com`) whose static HTML is
  an empty app shell (no titles, no listings). That's a **Playwright** target →
  defer to the Playwright adapter work, don't pretend a selector fixes it.

So this PR: **fix Eventbrite properly, re-scope council jobs to Playwright**, and
add live HTML fixtures so selector/JSON drift is caught in CI.

## Findings (live, 2026-07-09)

### Eventbrite (`/d/united-kingdom--rotherham/events/`)

- `HTTP 200`, 608 KB, server-rendered.
- Contains **1 `application/ld+json` block** — an `ItemList` of **24 events**, each
  with `name`, `url`, and `location.address.addressLocality` (e.g. "Rotherham",
  "Brinsworth"). Also a `window.__SERVER_DATA__` blob (redundant with the JSON-LD).
- The visible card anchors (~20) are a **geographic sprawl**: `.ca` Toronto, a
  "Meadowhall" (Sheffield) class, national online workshops. The
  `united-kingdom--rotherham` URL is a loose "near Rotherham" browse, **not** a
  strict filter — which is exactly why the old card-selector run returned junk.
- **The addressLocality field is the fix.** Filter events whose locality is a
  Rotherham-area town; drop the rest.

### Council jobs (`rotherham.gov.uk/jobs`)

- `HTTP 200`, but it's a hub page. Only in-site links to category pages
  (`/adults-social-care-jobs`, `/childrens-social-work-jobs`, …) — **no vacancies**.
- The single external recruitment link goes to `ce0351li.webitrent.com/...ETREC179GF.open`.
  Fetching that: `HTTP 200`, 18 KB, **empty `<title>`, no `£`/closing-date/vacancy
  rows in the static HTML** — a JS app shell. Cheerio sees nothing to scrape.
- **Conclusion:** council jobs is a Playwright target, full stop. No selector change
  makes `rotherham.gov.uk/jobs` yield listings.

## Plan

### 1. Eventbrite via JSON-LD (`packages/sources`)

The current `HtmlAdapter` only does CSS-card extraction. Rather than overload it,
add a small, explicit strategy on the HTML source config:

- Extend `HtmlSelectors`/`SourceConfig` with an optional **`jsonLd` strategy**: when
  set, the adapter parses the first `application/ld+json` `ItemList`, maps
  `itemListElement[].item` → `FetchedItem` (`name`→title, `url`→link,
  `description`→summary, `image`→imageUrl, keeps the raw JSON object in `raw`).
- Add an optional **`localityAllow: string[]`** on the config. When present, the
  adapter keeps only items whose `location.address.addressLocality` matches (case-
  insensitive, whole-word) one of the allowed towns. Seed it with the Rotherham-area
  set (Rotherham, Brinsworth, Maltby, Wath, Rawmarsh, Dinnington, Wickersley,
  Swinton, Kimberworth, Thurcroft, Aston, …) — reuse/centralise the same town list
  the relevance keyword filter already knows about in `@rovrum/core` rather than
  duplicating it.
- Keep the existing CSS-selector path untouched for future server-rendered sources.
- This lives in the adapter (source-agnostic mechanism), the town list in `core`
  (shared vocabulary). No web-app or DB logic.

**Why JSON-LD over cards + `regional: true`:** the issue floated marking it
`regional` so the keyword filter strips non-Rotherham events. But the keyword filter
runs on title/excerpt text — a "Leadership Workshop" in Leeds has no Rotherham
keyword either way, so it'd be dropped correctly, but a generically-titled event
_in_ Rotherham could be dropped wrongly, and a national event whose title happens to
mention a keyword slips through. Filtering on the **structured locality** the page
already gives us is precise and robust.

**Decision: do NOT set `regional: true` on Eventbrite.** The worker's keyword filter
runs on title + excerpt, so it would _wrongly drop_ a genuinely-local event with a
generic title (e.g. "Yoga for Mobility and Mind" in Rotherham). The structured-
locality filter is the precise, sufficient gate; layering the keyword filter on top
is net-harmful, not belt-and-braces.

### 2. Council jobs → Playwright (defer, don't fake)

- Keep **`Rotherham MBC — Jobs` disabled** in `seed-data.ts`, but update its comment
  and point its URL at the real portal (`ce0351li.webitrent.com/...`) so the eventual
  Playwright adapter has the right target, and add a `needsJs: true`-style marker/
  comment so it's clearly Playwright-bound, not "TODO selectors".
- File/So note it under the existing Playwright follow-up (RUFC/Millers, NHS Jobs)
  rather than #9. #9's council-jobs criterion is satisfied by the finding: it's not a
  Cheerio target.

### 3. Fixtures + tests (CI drift guard)

- Save `packages/sources/src/__fixtures__/eventbrite.html` (the live 608 KB page) and
  a trimmed `eventbrite.jsonld.json` for fast assertions.
- Unit-test the JSON-LD strategy against the fixture: asserts it extracts N events,
  that `localityAllow` filtering drops the Toronto/Meadowhall/national ones, and that
  every surviving item has a Rotherham-area locality + canonical `eventbrite.*/e/`
  link. (No network in tests — fixture only.)
- Extend `core` relevance/town-list tests if the town list moves there.

### 4. Re-enable + verify

- Re-enable **Eventbrite** in `seed-data.ts` (`enabled: true`), with the `jsonLd` +
  `localityAllow` config.
- Update `seed-data.test.ts`: enabled count becomes **19** (18 RSS + Eventbrite),
  disabled **3**; relax the "all enabled are RSS" invariant to "all enabled are RSS
  **or** the JSON-LD Eventbrite source"; update the disabled-names list (council jobs,
  Millers, NHS jobs).
- Live `verify` run: confirm Eventbrite yields only Rotherham-area events with sane
  counts and no global junk; council jobs stays disabled.

## Acceptance criteria (from #9, reconciled with findings)

- [x] Council-jobs: **finding** — `rotherham.gov.uk/jobs` is a hub; real vacancies are
      a JS WebiTrent portal → Playwright, not Cheerio. Stays disabled, re-scoped.
- [x] Eventbrite yields only Rotherham-area events (JSON-LD `addressLocality` filter),
      verified against a live fixture and a live run (16 found, all Rotherham/Brinsworth/Whiston).
- [x] Eventbrite re-enabled in `seed-data.ts`; seed-data tests updated (19 enabled / 3 disabled).
- [x] Live `verify` run shows sane per-source counts, no global junk (12 new; re-run 0 new = dedup).
- [x] Eventbrite HTML + JSON-LD fixtures committed; JSON-LD strategy unit-tested (10 html tests).

## Out of scope

- Building the Playwright adapter (its own ticket — council jobs, Millers, NHS jobs,
  and the intermittently-403ing Wentworth Woodhouse feed all wait on it).
- Any web-app / rendering work (Phase 2).
