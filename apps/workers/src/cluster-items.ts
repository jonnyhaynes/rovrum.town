import { sameStory, similarity } from "@rovrum/core";
import type { PrismaClient, ContentItem, Vertical } from "@rovrum/db";

/** How far back (ms) to look for a matching story. 48h — see the plan. */
const WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ClusterStats {
  /** Items joined to an existing cluster. */
  clustered: number;
  /** New singleton clusters created (each item became its own canonical). */
  newClusters: number;
  /** Joins where the newcomer displaced the previous canonical (re-elections). */
  recanonicalized: number;
}

/**
 * The minimal ContentItem shape the matcher/election needs. `regional` is the
 * source's regional flag — the canonical tie-breaker (native beats regional).
 * Kept narrow so callers (and tests) don't have to build a full row.
 */
type ClusterableItem = Pick<
  ContentItem,
  "id" | "title" | "vertical" | "publishedAt" | "createdAt"
> & { regional: boolean };

/** The reference timestamp for windowing: prefer publishedAt, fall back to ingest time. */
function itemTime(item: ClusterableItem): number {
  return (item.publishedAt ?? item.createdAt).getTime();
}

/**
 * Should `challenger` replace `incumbent` as a cluster's canonical? The rule
 * (docs/plans/dedup-clustering.md): earliest `publishedAt` wins; a dated item
 * always beats an undated one; ties broken by source priority (native beats
 * regional); any remaining tie keeps the incumbent (stable, no churn).
 */
export function shouldReplaceCanonical(
  incumbent: { publishedAt: Date | null; regional: boolean },
  challenger: { publishedAt: Date | null; regional: boolean },
): boolean {
  const inc = incumbent.publishedAt?.getTime();
  const cha = challenger.publishedAt?.getTime();

  // Dated vs undated: a dated item is always preferred as the face of the story.
  if (inc === undefined && cha !== undefined) return true;
  if (cha === undefined) return false;
  if (inc === undefined) return true; // cha is dated, inc is not (handled above, but explicit)

  if (cha < inc) return true;
  if (cha > inc) return false;

  // Same publish time: native (non-regional) beats regional.
  return incumbent.regional && !challenger.regional;
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
  const stats: ClusterStats = { clustered: 0, newClusters: 0, recanonicalized: 0 };

  for (const item of items) {
    try {
      const joined = await tryJoinCluster(prisma, item);
      if (joined) {
        stats.clustered++;
        if (joined.recanonicalized) stats.recanonicalized++;
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
 * Find the best-matching existing cluster for `item` and join it, re-electing the
 * cluster canonical if `item` now wins the rule. Returns null if no candidate met
 * the threshold (caller starts a new cluster), else the outcome. Compares against
 * each candidate cluster's canonical title.
 */
async function tryJoinCluster(
  prisma: PrismaClient,
  item: ClusterableItem,
): Promise<{ recanonicalized: boolean } | null> {
  const ref = itemTime(item);
  const candidates = await recentCanonicals(prisma, item.vertical, ref, item.id);

  let best: { candidate: CanonicalCandidate; score: number } | null = null;
  for (const c of candidates) {
    const score = similarity(item.title, c.title);
    if (score >= (best?.score ?? 0) && sameStory(item.title, c.title)) {
      best = { candidate: c, score };
    }
  }

  if (!best) return null;

  const cluster = best.candidate;
  await prisma.contentItem.update({
    where: { id: item.id },
    data: { clusterId: cluster.clusterId },
  });

  // Canonical re-election: the newcomer becomes the face if it wins the rule.
  const replace = shouldReplaceCanonical(
    { publishedAt: cluster.canonicalPublishedAt, regional: cluster.canonicalRegional },
    { publishedAt: item.publishedAt, regional: item.regional },
  );
  if (replace) {
    await prisma.storyCluster.update({
      where: { id: cluster.clusterId },
      data: { canonicalItemId: item.id },
    });
  }
  return { recanonicalized: replace };
}

/** A candidate cluster's canonical: id, title, and the fields the election needs. */
interface CanonicalCandidate {
  clusterId: string;
  title: string;
  canonicalPublishedAt: Date | null;
  canonicalRegional: boolean;
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
    select: {
      id: true,
      canonicalItem: {
        select: { title: true, publishedAt: true, source: { select: { config: true } } },
      },
    },
  });

  return clusters
    .filter((c) => c.canonicalItem !== null)
    .map((c) => ({
      clusterId: c.id,
      title: c.canonicalItem!.title,
      canonicalPublishedAt: c.canonicalItem!.publishedAt,
      canonicalRegional: isRegionalConfig(c.canonicalItem!.source.config),
    }));
}

/** True if a source's JSON config marks it regional (native feeds are the default). */
function isRegionalConfig(config: unknown): boolean {
  return (config as { regional?: boolean } | null)?.regional === true;
}
