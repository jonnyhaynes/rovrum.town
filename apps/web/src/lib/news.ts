// Data layer for the News vertical. Keeps pages thin: all DB reads live here,
// return narrow view types (never raw Prisma rows), and never write. Queries run
// at build time (SSG) against the shared @rovrum/db client.
// See docs/plans/phase-2-web-mvp.md §4.
import { prisma, Prisma } from "@rovrum/db";

/** Default number of items a feed page shows when no limit is given. */
export const DEFAULT_NEWS_LIMIT = 30;

/**
 * A single news item as the UI needs it — headline, excerpt, attribution and
 * the canonical source link. Deliberately narrow: `raw`/`contentHash` and other
 * internals never reach the template, and source attribution is flattened to a
 * plain `sourceName` rather than a nested relation.
 */
export interface NewsCardView {
  id: string;
  title: string;
  excerpt: string;
  /** The original source URL — every card links out here (aggregator boundary). */
  canonicalUrl: string;
  imageUrl: string | null;
  author: string | null;
  publishedAt: Date | null;
  sourceName: string;
  /**
   * Other outlets covering the same story (cross-publisher cluster members),
   * named for the "also reported by" credit — alphabetical, de-duped, and never
   * including this item's own source. Empty for a single-source story.
   */
  alsoReportedBy: string[];
}

export interface GetLatestNewsOptions {
  limit?: number;
}

/** Items per listing page (pages 2+ show this many in the three-across grid). */
export const NEWS_PER_PAGE = 20;

/**
 * Front-page composition sizes: 1 lead + 3 briefs ("Also this morning") + 3 in
 * the "More from Rotherham" run = 7 items shown on page 1. The rest paginate onto
 * the listing pages. Kept here (not in the .astro frontmatter) so getStaticPaths
 * and the page body share one source of truth — Astro's getStaticPaths runs in an
 * isolated scope and can't close over page-level consts.
 */
export const FRONT_BRIEFS = 3;
export const FRONT_RUN = 3;
/** Total items on the front page (lead + briefs + run). */
export const FRONT_TOTAL = 1 + FRONT_BRIEFS + FRONT_RUN;

// Shared query pieces so every read stays consistent: NEWS-only, newest-first,
// and the same narrow column set. Newest-first uses `id` as a stable tiebreak
// so paging is deterministic and static builds are reproducible.
//
// One row per story (cluster-aware): a feed row is either an unclustered
// singleton (clusterId null) OR the canonical of its cluster (`canonicalOf`
// set). Non-canonical members are excluded from the list — they surface only as
// "also reported by" on the canonical. See docs/plans/phase-2-feed-clustering.md.
const NEWS_WHERE: Prisma.ContentItemWhereInput = {
  vertical: "NEWS",
  OR: [{ clusterId: null }, { canonicalOf: { isNot: null } }],
};
const NEWS_ORDER: Prisma.ContentItemOrderByWithRelationInput[] = [
  { publishedAt: "desc" },
  { id: "desc" },
];
const NEWS_SELECT = {
  id: true,
  title: true,
  excerpt: true,
  canonicalUrl: true,
  imageUrl: true,
  author: true,
  publishedAt: true,
  source: { select: { name: true } },
  // The cluster this item heads (null for singletons); its members carry the
  // source names for the "also reported by" credit.
  canonicalOf: { select: { members: { select: { source: { select: { name: true } } } } } },
} satisfies Prisma.ContentItemSelect;

// The exact row shape the select above returns — derived, so it can't drift.
type NewsRow = Prisma.ContentItemGetPayload<{ select: typeof NEWS_SELECT }>;

/**
 * The other outlets' names for a canonical row: every cluster member's source
 * name minus this item's own, de-duped and sorted alphabetically. Empty for a
 * singleton or a single-source cluster.
 */
function otherSources(r: NewsRow): string[] {
  const members = r.canonicalOf?.members ?? [];
  const names = new Set(members.map((m) => m.source.name));
  names.delete(r.source.name);
  return [...names].sort((a, b) => a.localeCompare(b));
}

function toView(r: NewsRow): NewsCardView {
  return {
    id: r.id,
    title: r.title,
    excerpt: r.excerpt,
    canonicalUrl: r.canonicalUrl,
    imageUrl: r.imageUrl,
    author: r.author,
    publishedAt: r.publishedAt,
    sourceName: r.source.name,
    alsoReportedBy: otherSources(r),
  };
}

/**
 * The latest NEWS items, newest first. Ordered by `publishedAt` desc with `id`
 * as a stable tiebreak (deterministic paging and reproducible static builds).
 */
export async function getLatestNews(options: GetLatestNewsOptions = {}): Promise<NewsCardView[]> {
  const { limit = DEFAULT_NEWS_LIMIT } = options;

  const rows = await prisma.contentItem.findMany({
    where: NEWS_WHERE,
    orderBy: NEWS_ORDER,
    take: limit,
    select: NEWS_SELECT,
  });

  return rows.map(toView);
}

/**
 * Every NEWS item, newest first. Feeds Astro's `paginate()` in the feed route's
 * `getStaticPaths`, which slices this into pages of `NEWS_PER_PAGE` at build
 * time. Fine to load in full: the aggregator model stores only
 * headline/excerpt/link per item, so the row set is small.
 */
export async function getAllNews(): Promise<NewsCardView[]> {
  const rows = await prisma.contentItem.findMany({
    where: NEWS_WHERE,
    orderBy: NEWS_ORDER,
    select: NEWS_SELECT,
  });
  return rows.map(toView);
}
