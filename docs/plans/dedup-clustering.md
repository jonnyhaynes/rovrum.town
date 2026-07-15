# Plan: reduce feed duplication (remove Reddit, cross-publisher clustering)

Status: **Decisions settled — awaiting human plan sign-off before implementation
code.** Part 1 (Reddit) and Part 2 (Advertiser "All") already shipped in PR #26.
Part 3 (clustering) is the remaining work; all four design questions are resolved
below.

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

### Data model (Prisma) — DECIDED: StoryCluster table
- New `StoryCluster` model: `id`, `canonicalItemId` (FK → ContentItem),
  `createdAt`. Cluster-level metadata has a home; canonical pointer lives in one
  place; "canonical + members" is a plain join.
- `ContentItem` gets a nullable `clusterId String?` FK → `StoryCluster`
  (+ `@@index([clusterId])`).
- Migration is additive/nullable → safe. Existing rows stay `clusterId = null`
  (implicit singletons); no backfill required to ship (optional backfill noted
  below).

### Matching (in `@rovrum/core`, pure + unit-tested) — DECIDED: token-set, conservative
- `clusterKey(title)`: lowercase, strip punctuation, drop stopwords + a small
  local-noise list ("rotherham", "millers", "rufc", etc. — tune carefully so we
  don't over-merge), sort tokens → a normalized token set.
- `similarity(a, b)`: **Sørensen–Dice over the token sets**. Pure function,
  exhaustively unit-tested with real Advertiser/Star headline pairs.
- **Starting threshold: 0.8 (conservative).** Merge only near-certain matches;
  prefer missing a dupe over wrongly merging distinct stories. Exposed as a named
  constant and tuned down with real data.
- Candidate window — **DECIDED: 48h AND same `vertical`.** Only compare against
  items with `publishedAt` within 48h and the same vertical. Bounds comparisons,
  keeps matches on-topic, and stops a re-run of an old story merging.

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

## Resolved decisions (agreed with owner)
1. **Cluster model:** `StoryCluster` table + nullable `clusterId` on `ContentItem`
   (not a self-referencing `canonicalId`).
2. **Match window:** 48h AND same `vertical`.
3. **Similarity:** Sørensen–Dice over normalized token sets; starting threshold
   **0.8 (conservative)**, exposed as a constant and tuned with real data.
4. **RUFC feeds:** keep all overlapping Sport + Rotherham-United feeds (Advertiser
   and Star). Exact hash collapses identical items; clustering groups the rest.
   Advertiser "All" already dropped in the prior merged PR (#26).

## Work breakdown — all shipped
1. ✅ **DB migration** — `StoryCluster` model + `ContentItem.clusterId` + index. (PR #28)
2. ✅ **`@rovrum/core`** — `clusterKey` + `similarity` (Sørensen–Dice) +
   `CLUSTER_THRESHOLD`, with the headline-pair unit-test suite (true positives +
   near-miss negatives). (PR #29)
3. ✅ **`apps/workers`** — clustering stage after exact-dedup insert: query the 48h
   same-vertical candidates, best-match ≥ threshold → join cluster, else new
   singleton + become canonical. Best-effort (failure → singleton, never drops the
   item). `IngestRun.stats` gains `clustered` / `newClusters`. (PR #30)
4. ✅ **Canonical rule** — `shouldReplaceCanonical`: earliest `publishedAt` wins
   (dated beats undated), ties broken by source priority (native > regional), full
   tie keeps the incumbent. Re-election runs on join; `IngestRun.stats` gains
   `recanonicalized`. (this PR)

No web/API work — that's Phase 2, noted above. The feed query returning one row
per cluster (canonical + "also reported by" members) is where this becomes
user-visible.
