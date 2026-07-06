import { describe, it, expect } from "vitest";
import { normalize } from "./normalize.js";
import type { FetchedItem, SourceLike } from "./types.js";

const newsSource: SourceLike = { id: "src_1", vertical: "NEWS" };

describe("normalize", () => {
  it("maps an RSS-style item into a NormalizedItem", () => {
    const item: FetchedItem = {
      title: "Council approves new park",
      link: "https://www.rotherham.gov.uk/news/park",
      summary: "A short summary of the plan.",
      author: "Press Office",
      publishedAt: new Date("2026-07-01T09:00:00Z"),
      imageUrl: "https://www.rotherham.gov.uk/img/park.jpg",
      raw: { guid: "abc" },
    };

    const out = normalize(newsSource, item);

    expect(out.sourceId).toBe("src_1");
    expect(out.vertical).toBe("NEWS");
    expect(out.title).toBe("Council approves new park");
    expect(out.excerpt).toBe("A short summary of the plan.");
    expect(out.canonicalUrl).toBe("https://www.rotherham.gov.uk/news/park");
    expect(out.author).toBe("Press Office");
    expect(out.imageUrl).toBe("https://www.rotherham.gov.uk/img/park.jpg");
    expect(out.publishedAt).toEqual(new Date("2026-07-01T09:00:00Z"));
    expect(out.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maps an Atom-style item (Reddit) — missing optional fields become null", () => {
    const item: FetchedItem = {
      title: "What's the best chippy in town?",
      link: "https://www.reddit.com/r/rotherham/comments/xyz/",
      raw: { id: "t3_xyz" },
    };

    const out = normalize({ id: "src_reddit", vertical: "NEWS" }, item);

    expect(out.title).toBe("What's the best chippy in town?");
    expect(out.excerpt).toBe("");
    expect(out.author).toBeNull();
    expect(out.imageUrl).toBeNull();
    expect(out.publishedAt).toBeNull();
  });

  it("strips HTML from the summary to a plain-text excerpt", () => {
    const item: FetchedItem = {
      title: "Story",
      link: "https://example.com/a",
      summary: '<p>Hello <a href="#">world</a> &amp; friends</p>',
      raw: {},
    };
    expect(normalize(newsSource, item).excerpt).toBe("Hello world & friends");
  });

  it("collapses whitespace and trims a long excerpt to a snippet (aggregator boundary)", () => {
    const long = "word ".repeat(200).trim();
    const out = normalize(newsSource, {
      title: "Story",
      link: "https://example.com/a",
      summary: long,
      raw: {},
    });
    // A snippet, never the full body.
    expect(out.excerpt.length).toBeLessThanOrEqual(500);
    expect(out.excerpt.length).toBeLessThan(long.length);
  });

  it("preserves `raw` verbatim", () => {
    const raw = { nested: { a: 1 }, arr: [1, 2, 3] };
    const out = normalize(newsSource, {
      title: "Story",
      link: "https://example.com/a",
      raw,
    });
    expect(out.raw).toEqual(raw);
  });

  it("carries the source's vertical onto the item", () => {
    const out = normalize(
      { id: "s", vertical: "JOBS" },
      {
        title: "Job",
        link: "https://example.com/job",
        raw: {},
      },
    );
    expect(out.vertical).toBe("JOBS");
  });
});
