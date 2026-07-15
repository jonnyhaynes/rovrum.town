import { normalize, isRotherhamRelevant, type NormalizedItem } from "@rovrum/core";
import { getAdapter, type AdapterSource, type FetchDeps } from "@rovrum/sources";
import type { Browser } from "playwright";
import type { PrismaClient, Source } from "@rovrum/db";
import { clusterItems } from "./cluster-items.js";

export interface IngestDeps {
  prisma: PrismaClient;
  /** Adapter factory — injectable so tests can stub the network. */
  getAdapter?: typeof getAdapter;
  /** Fetch options passed to adapters (User-Agent, test fetch impl). */
  fetchDeps?: FetchDeps;
  /**
   * Resolves the shared Playwright browser — invoked lazily, and only for
   * PLAYWRIGHT sources, so RSS/HTML ingests never launch Chromium.
   */
  getBrowser?: () => Promise<Browser>;
}

export interface IngestResult {
  itemsFound: number;
  itemsNew: number;
  droppedIrrelevant: number;
  status: "SUCCESS" | "FAILED";
}

/**
 * Ingest one source: fetch → normalize → (relevance filter, if regional) → dedup
 * insert → record the IngestRun. Never throws for a source-level failure; it
 * records the run as FAILED and returns. The worker calls this per source.
 */
export async function runIngest(deps: IngestDeps, sourceId: string): Promise<IngestResult> {
  const { prisma } = deps;
  const adapterFactory = deps.getAdapter ?? getAdapter;

  const run = await prisma.ingestRun.create({
    data: { sourceId, status: "RUNNING" },
  });

  try {
    const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });

    // Playwright sources get the shared browser (launched lazily on first need).
    let fetchDeps = deps.fetchDeps;
    if (source.type === "PLAYWRIGHT" && deps.getBrowser) {
      fetchDeps = { ...fetchDeps, browser: await deps.getBrowser() };
    }
    const adapter = adapterFactory(source.type, fetchDeps);

    const fetched = await adapter.fetch(toAdapterSource(source));
    const regional = isRegional(source);

    const normalized: NormalizedItem[] = [];
    let droppedIrrelevant = 0;
    for (const item of fetched) {
      const n = normalize({ id: source.id, vertical: source.vertical }, item);
      // Regional feeds carry non-Rotherham items — filter on title + excerpt.
      if (regional && !isRotherhamRelevant(`${n.title} ${n.excerpt}`)) {
        droppedIrrelevant++;
        continue;
      }
      normalized.push(n);
    }

    // Dedup is a DB invariant: unique contentHash + skipDuplicates, not a
    // read-then-write race. createMany returns how many rows were actually new.
    const created = await prisma.contentItem.createMany({
      data: normalized.map((n) => ({
        sourceId: n.sourceId,
        vertical: n.vertical,
        title: n.title,
        excerpt: n.excerpt,
        canonicalUrl: n.canonicalUrl,
        imageUrl: n.imageUrl,
        author: n.author,
        publishedAt: n.publishedAt,
        contentHash: n.contentHash,
        raw: n.raw as object,
      })),
      skipDuplicates: true,
    });

    // Cross-publisher clustering runs on the rows that survived exact dedup and
    // aren't yet clustered. createMany returns only a count, so re-read the just-
    // inserted items by their contentHash. Best-effort: never fails the ingest.
    const fresh = await prisma.contentItem.findMany({
      where: {
        contentHash: { in: normalized.map((n) => n.contentHash) },
        clusterId: null,
      },
      select: { id: true, title: true, vertical: true, publishedAt: true, createdAt: true },
    });
    // All these items come from `source`, so they share its regional flag — the
    // canonical tie-breaker. Attach it rather than re-querying per item.
    const clusterStats = await clusterItems(
      prisma,
      fresh.map((f) => ({ ...f, regional })),
    );

    await prisma.$transaction([
      prisma.ingestRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          itemsFound: fetched.length,
          itemsNew: created.count,
          stats: { droppedIrrelevant, normalized: normalized.length, ...clusterStats },
        },
      }),
      prisma.source.update({
        where: { id: sourceId },
        data: { lastFetchedAt: new Date() },
      }),
    ]);

    return {
      itemsFound: fetched.length,
      itemsNew: created.count,
      droppedIrrelevant,
      status: "SUCCESS",
    };
  } catch (err) {
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { itemsFound: 0, itemsNew: 0, droppedIrrelevant: 0, status: "FAILED" };
  }
}

function isRegional(source: Source): boolean {
  const config = source.config as { regional?: boolean } | null;
  return config?.regional === true;
}

function toAdapterSource(source: Source): AdapterSource {
  return {
    id: source.id,
    type: source.type,
    url: source.url,
    config: source.config as AdapterSource["config"],
  };
}
