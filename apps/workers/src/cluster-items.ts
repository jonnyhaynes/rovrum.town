import { sameStory, similarity } from "@rovrum/core";
import type { PrismaClient, ContentItem, Vertical } from "@rovrum/db";

/** How far back (ms) to look for a matching story. 48h — see the plan. */
const WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ClusterStats {
  /** Items joined to an existing cluster. */
  clustered: number;
  /** New singleton clusters created (each item became its own canonical). */
  newClusters: number;
}

/**
 * The minimal ContentItem shape the matcher needs. Kept narrow so callers (and
 * tests) don't have to build a full row.
 */
type ClusterableItem = Pick<
  ContentItem,
  "id" | "title" | "vertical" | "publishedAt" | "createdAt"
>;

/** The reference timestamp for windowing: prefer publishedAt, fall back to ingest time. */
function itemTime(item: ClusterableItem): number {
  return (item.publishedAt ?? item.createdAt).getTime();
}

/**
 * Assign each freshly-inserted item to a cross-publisher story cluster: join the
 * best-matching recent cluster (same vertical, within the time window, title
 * similarity ≥ threshold) or start a new singleton cluster as its own canonical.
 *
 * Runs *after* exact-dedup insert, on items that survived it. Best-effort by
 * design — a failure clustering one item is swallowed so the item stays an
 * unclustered singleton (clusterId null); clustering never drops content or
 * fails the ingest. Sequential per item: within one ingest, an item can join a
 * cluster created moments earlier in the same batch.
 */
export async function clusterItems(
  prisma: PrismaClient,
  items: ClusterableItem[],
): Promise<ClusterStats> {
  const stats: ClusterStats = { clustered: 0, newClusters: 0 };

  for (const item of items) {
    try {
      const joined = await tryJoinCluster(prisma, item);
      if (joined) {
        stats.clustered++;
      } else {
        await prisma.storyCluster.create({
          data: {
            canonicalItemId: item.id,
            members: { connect: { id: item.id } },
          },
        });
        stats.newClusters++;
      }
    } catch {
      // Best-effort: leave this item unclustered (a singleton) and carry on.
    }
  }

  return stats;
}

/**
 * Find the best-matching existing cluster for `item` and join it. Returns true if
 * it joined one, false if no candidate met the threshold (caller starts a new
 * cluster). Compares against each candidate cluster's canonical title.
 */
async function tryJoinCluster(prisma: PrismaClient, item: ClusterableItem): Promise<boolean> {
  const ref = itemTime(item);
  const candidates = await recentCanonicals(prisma, item.vertical, ref, item.id);

  let best: { clusterId: string; score: number } | null = null;
  for (const c of candidates) {
    const score = similarity(item.title, c.title);
    if (score >= (best?.score ?? 0) && sameStory(item.title, c.title)) {
      best = { clusterId: c.clusterId, score };
    }
  }

  if (!best) return false;

  await prisma.contentItem.update({
    where: { id: item.id },
    data: { clusterId: best.clusterId },
  });
  return true;
}

/** A candidate cluster's canonical: the cluster id and the title to match against. */
interface CanonicalCandidate {
  clusterId: string;
  title: string;
}

/**
 * The canonical items of clusters in the same vertical whose canonical was
 * published within the window around `ref`. These are what a new item is matched
 * against — one representative per cluster keeps comparisons bounded.
 */
async function recentCanonicals(
  prisma: PrismaClient,
  vertical: Vertical,
  ref: number,
  excludeItemId: string,
): Promise<CanonicalCandidate[]> {
  const since = new Date(ref - WINDOW_MS);
  const until = new Date(ref + WINDOW_MS);

  const clusters = await prisma.storyCluster.findMany({
    where: {
      canonicalItem: {
        vertical,
        id: { not: excludeItemId },
        // Window on publishedAt when present; unpublished-date items fall back to
        // createdAt so they can still be matched.
        OR: [
          { publishedAt: { gte: since, lte: until } },
          { publishedAt: null, createdAt: { gte: since, lte: until } },
        ],
      },
    },
    select: { id: true, canonicalItem: { select: { title: true } } },
  });

  return clusters
    .filter((c): c is { id: string; canonicalItem: { title: string } } => c.canonicalItem !== null)
    .map((c) => ({ clusterId: c.id, title: c.canonicalItem.title }));
}
