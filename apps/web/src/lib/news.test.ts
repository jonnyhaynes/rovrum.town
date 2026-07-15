import { describe, it, expect, vi, beforeEach } from "vitest";

// The data layer is pure query-shaping over the shared Prisma client: filter to
// NEWS, order newest-first, cap the count, and project to a narrow view type
// that never leaks raw/jsonb internals to the template. We mock the client so
// these are fast, deterministic, and don't touch (or wipe) the dev database.
// See docs/plans/phase-2-web-mvp.md §4, §7.

const findMany = vi.fn();
vi.mock("@rovrum/db", () => ({
  prisma: {
    contentItem: {
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));

// Imported after the mock is registered.
const { getLatestNews, getAllNews } = await import("./news.js");

/** A Prisma-row-shaped fixture (superset of what the view needs). */
function row(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    title: "Rotherham council approves new park",
    excerpt: "Councillors gave the green light…",
    canonicalUrl: "https://advertiser.example/park",
    imageUrl: "https://advertiser.example/park.jpg",
    author: "A. Reporter",
    publishedAt: new Date("2026-07-09T10:00:00Z"),
    source: { name: "Rotherham Advertiser" },
    // canonicalOf: the cluster this item heads (null for unclustered singletons).
    // Its `members` carry every cluster member's source name.
    canonicalOf: null,
    // Fields the view must NOT expose:
    raw: { huge: "payload" },
    contentHash: "deadbeef",
    ...over,
  };
}

/** Build a `canonicalOf` cluster payload from a list of member source names. */
function cluster(memberSourceNames: string[]) {
  return { members: memberSourceNames.map((name) => ({ source: { name } })) };
}

describe("getLatestNews", () => {
  beforeEach(() => {
    // Call history accumulates across tests otherwise, so `mock.calls[0]` would
    // point at an earlier test's query.
    findMany.mockReset();
  });

  it("queries only NEWS items, newest first", async () => {
    findMany.mockResolvedValueOnce([row()]);
    await getLatestNews({ limit: 10 });

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0]![0] as {
      where: { vertical: string };
      orderBy: unknown;
      take: number;
    };
    expect(arg.where.vertical).toBe("NEWS");
    expect(arg.orderBy).toEqual([{ publishedAt: "desc" }, { id: "desc" }]);
  });

  it("respects the limit", async () => {
    findMany.mockResolvedValueOnce([]);
    await getLatestNews({ limit: 5 });
    const arg = findMany.mock.calls[0]![0] as { take: number };
    expect(arg.take).toBe(5);
  });

  it("projects to a narrow view type — no raw/jsonb or dedup internals leak", async () => {
    findMany.mockResolvedValueOnce([row()]);
    const [item] = await getLatestNews({ limit: 10 });

    expect(item).toBeDefined();
    expect(item).toMatchObject({
      id: "c1",
      title: "Rotherham council approves new park",
      canonicalUrl: "https://advertiser.example/park",
      sourceName: "Rotherham Advertiser",
    });
    // The load-bearing boundary: internal fields never reach the view.
    expect(item).not.toHaveProperty("raw");
    expect(item).not.toHaveProperty("contentHash");
    // Attribution is flattened, not a nested Prisma relation object.
    expect(item).not.toHaveProperty("source");
  });

  it("carries the source link so cards can attribute + link out", async () => {
    findMany.mockResolvedValueOnce([row()]);
    const [item] = await getLatestNews({ limit: 10 });
    // Aggregator boundary: the canonical URL is the source, and it's present.
    expect(item!.canonicalUrl).toBe("https://advertiser.example/park");
    expect(item!.sourceName).toBe("Rotherham Advertiser");
  });

  it("tolerates a null image and null author", async () => {
    findMany.mockResolvedValueOnce([row({ imageUrl: null, author: null })]);
    const [item] = await getLatestNews({ limit: 10 });
    expect(item!.imageUrl).toBeNull();
    expect(item!.author).toBeNull();
  });

  it("defaults to a sane limit when none is given", async () => {
    findMany.mockResolvedValueOnce([]);
    await getLatestNews();
    const arg = findMany.mock.calls[0]![0] as { take: number };
    expect(arg.take).toBeGreaterThan(0);
  });
});

describe("getAllNews", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("fetches all NEWS items newest-first with no take limit (for paginate())", async () => {
    findMany.mockResolvedValueOnce([row(), row({ id: "c2" })]);
    const items = await getAllNews();

    const arg = findMany.mock.calls[0]![0] as {
      where: { vertical: string };
      orderBy: unknown;
      take?: number;
    };
    expect(arg.where.vertical).toBe("NEWS");
    expect(arg.orderBy).toEqual([{ publishedAt: "desc" }, { id: "desc" }]);
    expect(arg.take).toBeUndefined(); // paginate() slices; we don't cap here
    expect(items).toHaveLength(2);
  });

  it("projects to the narrow view type", async () => {
    findMany.mockResolvedValueOnce([row()]);
    const [item] = await getAllNews();
    expect(item).not.toHaveProperty("raw");
    expect(item).not.toHaveProperty("source");
    expect(item!.sourceName).toBe("Rotherham Advertiser");
  });
});

// The cluster-aware feed: one row per story. See docs/plans/phase-2-feed-clustering.md.
describe("cluster-aware feed", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("queries only canonicals or unclustered singletons (one row per story)", async () => {
    findMany.mockResolvedValueOnce([]);
    await getAllNews();
    const arg = findMany.mock.calls[0]![0] as {
      where: { vertical: string; OR: unknown[] };
    };
    expect(arg.where.vertical).toBe("NEWS");
    // A feed row is either unclustered OR the canonical of its cluster.
    expect(arg.where.OR).toEqual([{ clusterId: null }, { canonicalOf: { isNot: null } }]);
  });

  it("a clustered canonical carries the OTHER sources as alsoReportedBy (named, deduped, self excluded)", async () => {
    findMany.mockResolvedValueOnce([
      row({
        source: { name: "Rotherham Advertiser" },
        // Cluster of 3 members across 3 sources incl. the canonical's own +
        // a duplicate source name (two members from The Star).
        canonicalOf: cluster([
          "Rotherham Advertiser", // the canonical's own source — must be excluded
          "The Star",
          "The Star", // duplicate — must be de-duped
          "BBC News",
        ]),
      }),
    ]);
    const [item] = await getAllNews();
    // Named, alphabetical, self removed, deduped.
    expect(item!.alsoReportedBy).toEqual(["BBC News", "The Star"]);
  });

  it("an unclustered singleton has an empty alsoReportedBy", async () => {
    findMany.mockResolvedValueOnce([row({ canonicalOf: null })]);
    const [item] = await getAllNews();
    expect(item!.alsoReportedBy).toEqual([]);
  });

  it("a single-source cluster (only the canonical) has an empty alsoReportedBy", async () => {
    findMany.mockResolvedValueOnce([
      row({ source: { name: "Rotherham Advertiser" }, canonicalOf: cluster(["Rotherham Advertiser"]) }),
    ]);
    const [item] = await getAllNews();
    expect(item!.alsoReportedBy).toEqual([]);
  });

  it("does not leak the cluster relation object into the view", async () => {
    findMany.mockResolvedValueOnce([row({ canonicalOf: cluster(["Rotherham Advertiser", "The Star"]) })]);
    const [item] = await getAllNews();
    expect(item).not.toHaveProperty("canonicalOf");
    expect(item).not.toHaveProperty("cluster");
  });
});
