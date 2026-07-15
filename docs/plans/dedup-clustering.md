# Plan: reduce feed duplication (remove Reddit, cross-publisher clustering)

Status: **DRAFT — awaiting human approval before any implementation code.**

## Problem

Two distinct kinds of duplication in the feed:

1. **Intra-publisher overlap** — the Rotherham Advertiser exposes 6 feeds, and its
   "All" feed is a superset of the vertical-specific ones. The same story appears
   in "All" and "News" with an identical URL + title, so the existing exact hash
   (`SHA-256(canonicalUrl + title)`, `content_items.contentHash @unique`) already
   collapses them. The waste is redundant fetching, and "All" mis-tags everything
   as `NEWS`.

2. **Cross-publisher duplication** — the same story (a RUFC result, a council
   decision) is covered by the Advertiser, The Star, YorkshireLive and BBC with
   **different URLs and differently-worded headlines**. Different hash → both are
   stored. The exact hash cannot catch this. This is the real problem.

Also in scope, unrelated: **remove the Reddit source.**

## Decisions (agreed with owner)

- Cross-publisher approach: **deterministic fuzzy title clustering** (normalize +
  token-set/trigram similarity within a time window). No AI/embeddings — that
  stays a later phase and would add a provider dependency and non-determinism.
- Handling: **keep one canonical item, group the rest** as "also reported by".
  Nothing is discarded (unlike the exact hash, which hard-skips).

## Part 1 — Remove Reddit (done in this branch, mechanical)

- Deleted the `Reddit r/Rotherham` entry from `packages/sources/src/seed-data.ts`.
- Updated the count assertion in `seed-data.test.ts` (22 → 21).
- The Atom-parsing test in `rss.test.ts` keeps its `reddit.atom.xml` fixture — it
  tests the Atom format, not the source, so it stays.
- **DB caveat:** `seedSources` is upsert-only and never prunes. Existing envs that
  already seeded Reddit keep the `Source` row + its `content_items`. Requires a
  one-off manual delete (documented in the PR).

## Part 2 — Intra-publisher overlap (small, low-risk)

- **Done in this branch:** dropped **"Rotherham Advertiser — All"** from the
  registry (count 21 → 20); keeps News / Sport / RUFC / What's On / Jobs, which
  carry correct verticals and cover the same items.
- Re-audit remaining overlapping feeds (Star Sport vs Star RUFC; Advertiser Sport
  vs Advertiser RUFC) — decision recorded in the PR; likely keep, since the exact
  hash already dedups identical items and the tag-specific feeds aid vertical
  accuracy.
- Update `seed-data.test.ts` counts/assertions accordingly.

## Part 3 — Cross-publisher clustering (the substantive work)

### Why not extend the hash
Exact dedup is stateless: a DB unique constraint + `skipDuplicates`, race-free,
inline at insert. Fuzzy clustering is inherently a **read-then-decide** step — an
item must be compared against *recent existing items*. So it must be a separate
stage, not a change to `contentHash`. The exact hash stays exactly as-is (it is
correct and cheap); clustering runs *after* a row survives exact dedup.

### Data model (Prisma)
- New nullable `clusterId String?` on `ContentItem` (+ `@@index([clusterId])`).
- Either a lightweight `StoryCluster` model (`id`, `canonicalItemId`,
  `createdAt`) or a self-referencing `canonicalId` on `ContentItem`. Leaning
  `StoryCluster` for a clean "canonical + members" query. **Decide in review.**
- Migration is additive/nullable → safe; existing rows are singleton clusters.

### Matching (in `@rovrum/core`, pure + unit-tested)
- `clusterKey(title)`: lowercase, strip punctuation, drop stopwords + a small
  local-noise list ("rotherham", "millers", "rufc", etc. — tune carefully so we
  don't over-merge), sort tokens → a normalized token set.
- `similarity(a, b)`: token-set ratio (Jaccard/Sørensen) and/or trigram; a
  tuned threshold decides "same story". Pure function, exhaustively unit-tested
  with real headline pairs from the two publishers.
- Candidate window: only compare against items with `publishedAt` within N hours
  (default ~48h) and ideally the same `vertical`, to bound comparisons and avoid
  merging a re-run of an old story.

### Pipeline placement (`apps/workers`)
- After exact-dedup insert, a clustering step assigns `clusterId`:
  find best-matching recent cluster above threshold → join it; else start a new
  singleton cluster and become its canonical.
- Canonical selection rule (deterministic): earliest `publishedAt`, tie-broken by
  a source-priority order (native Advertiser/MBC > regional Star/BBC). Recorded
  as a constant so it's reviewable.
- **Concurrency:** ingest currently runs sources sequentially (`ingest-pass.ts`),
  so a simple per-item transaction is safe for now. Note for the future: if
  ingest parallelises, clustering needs a lock/serialization — flag, don't build.
- Observability: extend `IngestRun.stats` with `clustered` / `newClusters`.

### Web/API (Phase 2, out of scope here but noted)
- Feed query returns one row per cluster (the canonical) with a `members` count /
  source list for the "also reported by" UI. No web code in this ticket.

## Testing
- Core: unit tests for `clusterKey` + `similarity` with curated Advertiser/Star
  headline pairs (true positives *and* near-miss true negatives to pin the
  threshold). This is where correctness is won.
- Workers: ingest test asserting two near-duplicate items across two sources land
  in one cluster with the expected canonical; unrelated items stay separate.
- Existing exact-dedup tests must remain green (behaviour unchanged).

## Rollout / risk
- Additive migration; clustering is best-effort and never blocks ingest (wrap so a
  clustering failure degrades to "singleton cluster", never drops the item).
- Threshold is the main risk (over-merging distinct stories). Ship conservative
  (high threshold) and tune with real data; log near-threshold decisions.

## Open questions for the reviewer
1. `StoryCluster` model vs self-referencing `canonicalId`?
2. Time window (48h?) and whether to require same `vertical`.
3. Similarity metric + starting threshold — conservative to avoid over-merge.
4. Confirm dropping Advertiser "All" (and the RUFC-feed audit outcome).
