import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, it, expect } from "vitest";
import ArticleCard from "./ArticleCard.astro";
import type { NewsCardView } from "../lib/news.js";

const base: NewsCardView = {
  id: "c1",
  title: "Rotherham council approves new riverside park",
  excerpt: "Councillors gave the green light to the long-awaited scheme…",
  canonicalUrl: "https://advertiser.example/riverside-park",
  imageUrl: "https://advertiser.example/park.jpg",
  author: "A. Reporter",
  publishedAt: new Date("2026-07-09T10:00:00Z"),
  sourceName: "Rotherham Advertiser",
  alsoReportedBy: [],
};

async function render(item: NewsCardView): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(ArticleCard, { props: { item } });
}

describe("ArticleCard", () => {
  it("shows the headline and excerpt", async () => {
    const html = await render(base);
    expect(html).toContain("Rotherham council approves new riverside park");
    expect(html).toContain("Councillors gave the green light");
  });

  it("attributes the source", async () => {
    const html = await render(base);
    expect(html).toContain("Rotherham Advertiser");
  });

  it("renders the image when present", async () => {
    const html = await render(base);
    expect(html).toContain("https://advertiser.example/park.jpg");
  });

  it("degrades gracefully when the image is null", async () => {
    const html = await render({ ...base, imageUrl: null });
    // No broken <img> with an empty/undefined src.
    expect(html).not.toMatch(/<img[^>]*src=["'](undefined|null|)["']/);
  });

  // LOAD-BEARING (aggregator boundary, docs/plans/phase-2-web-mvp.md §5, §7):
  // the card's primary link must point at the source's canonicalUrl — never an
  // internal route. This test fails if a future change makes the card link
  // on-site, which would turn the aggregator into a rehost.
  it("links the headline out to the source canonicalUrl, not an internal route", async () => {
    const html = await render(base);
    // The canonical URL is present as an href.
    expect(html).toContain(`href="https://advertiser.example/riverside-park"`);

    // Every anchor either points at the canonical URL or is an external source
    // link — none is a relative/internal path.
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("http")).toBe(true);
      expect(href.startsWith("/")).toBe(false);
    }
    // And the headline specifically wraps in a link to the source.
    expect(html).toMatch(
      /href=["']https:\/\/advertiser\.example\/riverside-park["'][^>]*>[\s\S]*Rotherham council approves/,
    );
  });

  it("marks external links safe (noopener)", async () => {
    const html = await render(base);
    expect(html).toMatch(/rel=["'][^"']*noopener[^"']*["']/);
  });

  it("credits other outlets when the story is clustered", async () => {
    const html = await render({ ...base, alsoReportedBy: ["BBC News", "The Star"] });
    expect(html).toContain("also reported by");
    expect(html).toContain("BBC News");
    expect(html).toContain("The Star");
  });

  it("omits the 'also reported by' line for a single-source story", async () => {
    const html = await render({ ...base, alsoReportedBy: [] });
    expect(html).not.toContain("also reported by");
  });
});
