import "./env.js";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@rovrum/db";
import type { FetchedItem, AdapterSource, SourceAdapter } from "@rovrum/sources";
import { runIngest } from "./ingest.js";

/** A stub adapter factory returning fixed items (or throwing), no network. */
function stubAdapter(items: FetchedItem[] | (() => never)): () => SourceAdapter {
  return () => ({
    async fetch(_source: AdapterSource): Promise<FetchedItem[]> {
      if (typeof items === "function") items();
      return items as FetchedItem[];
    },
  });
}

const A: FetchedItem = {
  title: "Rotherham council approves park",
  link: "https://example.com/a",
  summary: "A summary",
  raw: { n: 1 },
};
const B: FetchedItem = {
  title: "Maltby school news",
  link: "https://example.com/b",
  summary: "Another",
  raw: { n: 2 },
};

async function makeSource(overrides: Record<string, unknown> = {}): Promise<string> {
  const s = await prisma.source.create({
    data: {
      name: "Test Source",
      type: "RSS",
      vertical: "NEWS",
      url: `https://test.example.com/${Math.round(performance.now() * 1000)}-${Math.random()}`,
      ...overrides,
    },
  });
  return s.id;
}

// Clean content between tests so dedup assertions are deterministic.
beforeEach(async () => {
  await prisma.contentItem.deleteMany();
  await prisma.ingestRun.deleteMany();
  await prisma.source.deleteMany();
});

afterAll(async () => {
  // Leave the DB clean so a subsequent `seed` + worker run isn't polluted by
  // this suite's test rows.
  await prisma.contentItem.deleteMany();
  await prisma.ingestRun.deleteMany();
  await prisma.source.deleteMany();
  await prisma.$disconnect();
});

describe("runIngest (integration)", () => {
  it("inserts new items and records a SUCCESS IngestRun", async () => {
    const sourceId = await makeSource();
    const result = await runIngest({ prisma, getAdapter: stubAdapter([A, B]) }, sourceId);

    expect(result.status).toBe("SUCCESS");
    expect(result.itemsFound).toBe(2);
    expect(result.itemsNew).toBe(2);

    const run = await prisma.ingestRun.findFirstOrThrow({ where: { sourceId } });
    expect(run.status).toBe("SUCCESS");
    expect(run.itemsFound).toBe(2);
    expect(run.itemsNew).toBe(2);
    expect(run.finishedAt).not.toBeNull();

    const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
    expect(source.lastFetchedAt).not.toBeNull();
  });

  it("dedups on re-run: second run of the same items inserts 0 new", async () => {
    const sourceId = await makeSource();
    const deps = { prisma, getAdapter: stubAdapter([A, B]) };

    const first = await runIngest(deps, sourceId);
    expect(first.itemsNew).toBe(2);

    const second = await runIngest(deps, sourceId);
    expect(second.itemsFound).toBe(2);
    expect(second.itemsNew).toBe(0); // dedup via unique contentHash

    expect(await prisma.contentItem.count()).toBe(2);
  });

  it("drops off-topic items from a regional source and records the count", async () => {
    const sourceId = await makeSource({ config: { regional: true } });
    const offTopic: FetchedItem = {
      title: "Sheffield United beat Leeds",
      link: "https://example.com/sheff",
      summary: "Nothing to do with our patch",
      raw: {},
    };
    const result = await runIngest({ prisma, getAdapter: stubAdapter([A, offTopic]) }, sourceId);

    expect(result.itemsFound).toBe(2);
    expect(result.itemsNew).toBe(1); // only the Rotherham item
    expect(result.droppedIrrelevant).toBe(1);

    const run = await prisma.ingestRun.findFirstOrThrow({ where: { sourceId } });
    expect((run.stats as { droppedIrrelevant: number }).droppedIrrelevant).toBe(1);
  });

  it("keeps all items from a non-regional source even if off-topic", async () => {
    const sourceId = await makeSource(); // not regional
    const offTopic: FetchedItem = {
      title: "Sheffield United beat Leeds",
      link: "https://example.com/sheff2",
      summary: "x",
      raw: {},
    };
    const result = await runIngest({ prisma, getAdapter: stubAdapter([A, offTopic]) }, sourceId);
    expect(result.itemsNew).toBe(2);
    expect(result.droppedIrrelevant).toBe(0);
  });

  it("records FAILED (and does not throw) when the adapter fails", async () => {
    const sourceId = await makeSource();
    const result = await runIngest(
      {
        prisma,
        getAdapter: stubAdapter(() => {
          throw new Error("feed 403");
        }),
      },
      sourceId,
    );

    expect(result.status).toBe("FAILED");
    const run = await prisma.ingestRun.findFirstOrThrow({ where: { sourceId } });
    expect(run.status).toBe("FAILED");
    expect(run.error).toContain("403");
  });
});
