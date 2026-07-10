// Data layer for the News vertical. Keeps pages thin: all DB reads live here,
// return narrow view types (never raw Prisma rows), and never write. Queries run
// at build time (SSG) against the shared @rovrum/db client.
// See docs/plans/phase-2-web-mvp.md §4.
import { prisma } from "@rovrum/db";

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

/**
 * The latest NEWS items, newest first. Ordered by `publishedAt` desc with `id`
 * as a stable tiebreak (deterministic paging and reproducible static builds).
 */
export async function getLatestNews(options: GetLatestNewsOptions = {}): Promise<NewsCardView[]> {
  const { limit = DEFAULT_NEWS_LIMIT } = options;

  const rows = await prisma.contentItem.findMany({
    where: { vertical: "NEWS" },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      excerpt: true,
      canonicalUrl: true,
      imageUrl: true,
      author: true,
      publishedAt: true,
      source: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    excerpt: r.excerpt,
    canonicalUrl: r.canonicalUrl,
    imageUrl: r.imageUrl,
    author: r.author,
    publishedAt: r.publishedAt,
    sourceName: r.source.name,
  }));
}
