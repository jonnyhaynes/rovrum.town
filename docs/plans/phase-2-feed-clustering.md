# Plan: cluster-aware News feed query

Status: **APPROVED.** Open questions resolved: `alsoReportedBy` sorted
**alphabetically**; **no cap** on the named list.

## Problem

Clustering is shipped in the ingestion pipeline (`clusterId` + `StoryCluster`,
see `docs/plans/dedup-clustering.md`), but the web read side ignores it. Today
`apps/web/src/lib/news.ts` returns **every** `ContentItem`, so a story covered by
four outlets shows as four cards. The feed should show **one card per story** with
the other outlets credited as "also reported by".

This does not touch ingestion or the schema — it's a read-side change to the
existing, working feed (`news.ts` → `getAllNews`/`getLatestNews` →
`news/[...page].astro` → `ArticleCard`).

## Decisions (agreed with owner)

- **Feed rows: one card per cluster** — show the cluster's canonical only; members
  are hidden from the list and surfaced as attribution on the canonical card.
  Unclustered items (`clusterId = null`) each show as their own single card.
- **Scope: query layer + card attribution** in one PR — make `news.ts`
  cluster-aware, extend `NewsCardView`, and render the "also reported by" line on
  `ArticleCard`. No detail/cluster route (consistent with the web-MVP plan's lean
  against a detail route).
- **Attribution: named sources** — "also reported by The Star, BBC News".

## The core query rule

An item is a **feed row** iff it is *either*:
- the canonical of its cluster (`canonicalOf` relation is set — i.e. some
  `StoryCluster.canonicalItemId` points at it), **or**
- unclustered (`clusterId = null`).

This is exactly one row per story: clustered stories contribute their canonical;
uncovered stories contribute themselves. Members that aren't canonical are
excluded from the list (they appear only as attribution).

Prisma `where` (NEWS vertical, plus the row rule):

```ts
const NEWS_WHERE = {
  vertical: "NEWS",
  OR: [
    { clusterId: null },        // unclustered singletons
    { canonicalOf: { isNot: null } }, // this item is its cluster's canonical
  ],
};
```

Ordering is unchanged (`publishedAt desc, id desc`) — still deterministic for SSG.

### Fetching member attribution
For a canonical row, "also reported by" = the names of the sources of the *other*
members of its cluster. Fetch via the canonical's `canonicalOf` relation:

```ts
canonicalOf: {                       // the cluster this item heads (null for singletons)
  select: {
    members: {
      where: { NOT: { source: { name: /* self */ } } }, // exclude the canonical's own source
      select: { source: { select: { name: true } } },
    },
  },
},
```

Simpler and less error-prone: select **all** member source names, then in
`toView` drop the canonical's own `sourceName` and de-dupe (two members can share
a source). Compute `alsoReportedBy: string[]` there. Exact selection shape is an
implementation detail; the test pins the behaviour.

## Changes

### `apps/web/src/lib/news.ts`
- Extend `NEWS_WHERE` with the row rule above.
- Extend `NEWS_SELECT` to pull the cluster's members' source names via
  `canonicalOf`.
- Add `alsoReportedBy: string[]` to `NewsCardView` (empty for singletons and for
  clusters with only one source).
- `toView` computes `alsoReportedBy` (other members' source names, de-duped, self
  removed). Order: by member `publishedAt` or alphabetical — **decide in review**;
  alphabetical is deterministic and fine.
- `getLatestNews` / `getAllNews` keep their signatures; only the shape of a row
  grows. The route needs no change.

### `apps/web/src/components/ArticleCard.astro`
- When `alsoReportedBy.length > 0`, render one line: `also reported by
  {names.join(", ")}`. Purely additive; no change to the headline→canonicalUrl
  boundary.

### No change
- `news/[...page].astro` (still calls `getAllNews()` + `paginate()`).
- `Pagination.astro`, `Layout.astro`, schema, ingestion.

## Testing (test-first, matches the existing suite style)
- `news.test.ts`:
  - a cluster with 3 members yields **one** row (the canonical) with
    `alsoReportedBy` = the other two sources (named, de-duped, self excluded).
  - an unclustered item yields one row with `alsoReportedBy = []`.
  - non-canonical members do **not** appear as their own rows.
  - ordering unchanged (newest-first, stable tiebreak).
- `ArticleCard.test.ts`: renders the "also reported by" line when present, omits
  it when empty; headline still links to `canonicalUrl` (the load-bearing
  aggregator boundary — keep that assertion).

## Risks / notes
- **SSG timing:** queries run at build time; a canonical deleted post-build is a
  non-issue for a static build. `canonicalItemId` is `SetNull` on delete, so a
  cluster can transiently have no canonical — such a cluster would contribute
  **no** row until re-election. Acceptable (rare, self-heals next ingest); note
  it, don't engineer around it now.
- **Aggregator boundary intact:** every card (and the "also reported by" sources)
  still links out / credits; we never render member bodies.
- Perf is fine: aggregator rows are small and the feed is already loaded in full
  for pagination.

## Out of scope (future)
- Sports/Events/Jobs feeds (same pattern, later).
- A per-cluster detail page showing every outlet's take.
- Any runtime (non-SSG) querying.

## Resolved decisions
1. `alsoReportedBy` ordering: **alphabetical** (deterministic, reproducible SSG).
2. Named list: **no cap** — always list every other source.
