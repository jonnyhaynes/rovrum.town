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
}

export interface GetLatestNewsOptions {
  limit?: number;
}

/** Items per feed page (SSG paginates the /news feed by this size). */
export const NEWS_PER_PAGE = 20;

// Shared query pieces so every read stays consistent: NEWS-only, newest-first,
// and the same narrow column set. Newest-first uses `id` as a stable tiebreak
// so paging is deterministic and static builds are reproducible.
const NEWS_WHERE: Prisma.ContentItemWhereInput = { vertical: "NEWS" };
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
} satisfies Prisma.ContentItemSelect;

// The exact row shape the select above returns — derived, so it can't drift.
type NewsRow = Prisma.ContentItemGetPayload<{ select: typeof NEWS_SELECT }>;

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
