import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RssAdapter } from "./rss.js";
import type { AdapterSource } from "./adapter.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");
}

/** A fetch stub returning fixed body/status, so tests never hit the network. */
function stubFetch(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { "content-type": "application/rss+xml" },
    })) as unknown as typeof fetch;
}

const rssSource: AdapterSource = {
  id: "src_council",
  type: "RSS",
  url: "https://www.rotherham.gov.uk/rss/news",
};

describe("RssAdapter", () => {
  it("parses an RSS 2.0 feed into FetchedItem[]", async () => {
    const adapter = new RssAdapter({ fetchImpl: stubFetch(fixture("council-news.rss.xml")) });
    const items = await adapter.fetch(rssSource);

    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(first.title).toBeTruthy();
    expect(first.link).toMatch(/^https?:\/\//);
    expect(first.summary).toBeTruthy();
    expect(first.publishedAt).toBeInstanceOf(Date);
    // raw keeps the original parsed entry.
    expect(first.raw).toBeTypeOf("object");
  });

  it("parses an Atom feed (Reddit) into FetchedItem[]", async () => {
    const adapter = new RssAdapter({ fetchImpl: stubFetch(fixture("reddit.atom.xml")) });
    const items = await adapter.fetch({
      id: "src_reddit",
      type: "RSS",
      url: "https://www.reddit.com/r/rotherham/.rss",
    });

    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(first.title).toBeTruthy();
    expect(first.link).toMatch(/^https?:\/\//);
    // Reddit Atom entries carry an author name.
    expect(first.author).toBeTruthy();
  });

  it("parses the Rotherham Advertiser feed", async () => {
    const adapter = new RssAdapter({ fetchImpl: stubFetch(fixture("advertiser-news.rss.xml")) });
    const items = await adapter.fetch({
      id: "src_adv",
      type: "RSS",
      url: "https://www.rotherhamadvertiser.co.uk/news/rss/",
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.title && i.link)).toBe(true);
  });

  it("sends the configured User-Agent", async () => {
    let seenUA: string | null = null;
    const spyFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      seenUA = new Headers(init?.headers).get("user-agent");
      return new Response(fixture("council-news.rss.xml"), { status: 200 });
    }) as unknown as typeof fetch;

    const adapter = new RssAdapter({ fetchImpl: spyFetch, userAgent: "RovrumBot/1.0" });
    await adapter.fetch(rssSource);
    expect(seenUA).toBe("RovrumBot/1.0");
  });

  it("throws on a non-OK HTTP response", async () => {
    const adapter = new RssAdapter({ fetchImpl: stubFetch("nope", 403) });
    await expect(adapter.fetch(rssSource)).rejects.toThrow();
  });

  it("skips malformed entries without failing the whole feed", async () => {
    // A valid feed with one item missing its <link>. The good item survives.
    const feed = `<?xml version="1.0"?><rss version="2.0"><channel>
      <title>t</title>
      <item><title>Good</title><link>https://example.com/a</link><description>d</description></item>
      <item><title>No link here</title><description>d</description></item>
    </channel></rss>`;
    const adapter = new RssAdapter({ fetchImpl: stubFetch(feed) });
    const items = await adapter.fetch(rssSource);
    expect(items.map((i) => i.title)).toContain("Good");
    // The link-less item is dropped, not fatal.
    expect(items.every((i) => i.link)).toBe(true);
  });
});
