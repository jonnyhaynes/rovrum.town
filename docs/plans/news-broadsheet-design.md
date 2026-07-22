# Plan — News broadsheet redesign

**Goal.** Restyle the web app as a **broadsheet newspaper front page**: masthead,
dominant lead story, secondary stack, three-column run, hairline rules — using the
existing brand tokens (Ink/Paper/Red, Bitter + Inter). Establish it in the shared
`Layout` so every future vertical inherits it. Add the mailing-list signup, social
links, and copyright footer from the holding page.

Approved direction (mockup): full broadsheet, keep Bitter + Inter (feel from layout,
not new fonts), scope = news page + shared shell.

## What changes

### 1. `Layout.astro` — the shared newspaper shell

- **Masthead** (new): folio line (`Tuesday, 22 July 2026` · `Rotherham · South
Yorkshire` · `Free · Online edition`), oversized `Rovrum.` nameplate with red dot,
  italic tagline `Aye, that Rotherham. Said proper.`, thick-over-thin double rule,
  and a section strap (News / Sport / What's On / Jobs / The Millers).
  - The folio date is computed at build time (`new Date()` in the SSG build).
  - Section strap: News is `aria-current`; the others are placeholder `#` links
    until those verticals ship. A `sections` prop lets a page mark the active one.
- **Footer** (new): the holding page's social links (X, Facebook, Instagram,
  LinkedIn, TikTok — exact URLs) + the exact colophon
  (`© 2026. A Colouring Code design and build. Made with ♥ in Rovrum.`).
- **Signup** (new component, rendered in the shell above the footer): the
  mailing-list strip. Reuses the holding page's **Web3Forms** client-side POST
  pattern (same public access key, already in the committed holding page — not a new
  secret). Progressive: the form is a normal POST; JS enhances it for inline success.
- Keep the existing global tokens/reset; add masthead/footer/signup styles. Bump the
  font stylesheet to the weights already used (unchanged: `bitter:600,700,700i`,
  `inter:400,600` via Bunny).

### 2. News feed page — front-page composition on page 1

- **Page 1:** lead (first item) → secondary stack (next 3 as briefs) → a capped
  three-story "More from Rotherham" run. **Exactly 7 items** (1 + 3 + 3).
- **Pages 2+:** the remaining items in the **three-across grid** (same `StoryCard`
  + column dividers as the front-page run), `NEWS_PER_PAGE` (20) per page.
- Manual paging in `getStaticPaths` (not Astro's `paginate()`, which can't give
  page 1 a different size than the rest). Front-page sizes (`FRONT_TOTAL`,
  `FRONT_BRIEFS`, `FRONT_RUN`) live in `lib/news.ts` and are imported — Astro's
  `getStaticPaths` runs in an isolated scope and can't close over page-level
  consts, but module imports are in scope.
- Pager URLs built by hand (`/news`, `/news/2`, …); `Pagination.astro` reused.
- Empty state preserved (`Nowt to show just yet…`).

### 3. Components

- Extract the card variants so the page stays thin:
  - `LeadStory.astro` — the dominant front-page lead.
  - `StoryCard.astro` — the column-run / list card (replaces `ArticleCard` usage;
    keep `ArticleCard` or rename — decide during build to minimise churn).
  - `Brief.astro` — the compact secondary-stack item.
  - `Masthead.astro`, `SiteFooter.astro`, `SignupStrip.astro` under the layout.
- All keep the **aggregator boundary**: every headline links OUT to `canonicalUrl`
  (`target=_blank rel=noopener`), no on-site article route, no full content.

### 4. `BRAND.md`

- The guide currently says Bitter is "contemporary rather than
  traditional/**newspapery**". The site is now deliberately newspaper-styled. Add a
  short "Web — broadsheet treatment" note so the guide and the site agree (record the
  decision; don't rewrite the whole type rationale).

## Non-goals / boundaries

- No new fonts, no new colours (one red accent per view holds).
- No backend for signup (Web3Forms client POST, like the holding page).
- No article detail pages (aggregator model).
- Sports/events/jobs verticals still deferred — but the shell is built to host them.

## Verification

- `pnpm --filter @rovrum/web build` succeeds against a seeded DB; `/news` renders the
  front page, `/news/2` the list fallback.
- Existing web tests still pass; add/adjust component tests where the card shape
  changes (`news.test.ts`, `ArticleCard.test.ts`).
- Lint / check-types / test / build all green (CI will gate this).
- Manual: masthead, signup, socials, footer present; headlines link out; keyboard
  focus visible; reduced-motion respected; responsive down to mobile.
