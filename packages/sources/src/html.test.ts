import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HtmlAdapter } from "./html.js";
import type { AdapterSource } from "./adapter.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");
}

function stubFetch(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;
}

const jobsSource: AdapterSource = {
  id: "src_council_jobs",
  type: "HTML",
  url: "https://www.rotherham.gov.uk/jobs",
  config: {
    selectors: {
      item: "li.job",
      title: ".job-title",
      link: ".job-title a",
      excerpt: ".job-summary",
      image: ".job-image",
    },
  },
};

describe("HtmlAdapter", () => {
  it("extracts items from a server-rendered list using config selectors", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch(fixture("council-jobs.html")) });
    const items = await adapter.fetch(jobsSource);

    expect(items).toHaveLength(2); // the link-less third item is dropped
    const first = items[0]!;
    expect(first.title).toBe("Teaching Assistant");
    expect(first.summary).toBe("Permanent, term-time. Based in Maltby.");
  });

  it("resolves relative links and images against the source URL", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch(fixture("council-jobs.html")) });
    const items = await adapter.fetch(jobsSource);

    expect(items[0]!.link).toBe("https://www.rotherham.gov.uk/jobs/teaching-assistant");
    expect(items[0]!.imageUrl).toBe("https://www.rotherham.gov.uk/img/jobs/ta.jpg");
    // Absolute links are left as-is.
    expect(items[1]!.link).toBe("https://www.rotherham.gov.uk/jobs/social-worker");
  });

  it("keeps raw HTML of each item container", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch(fixture("council-jobs.html")) });
    const items = await adapter.fetch(jobsSource);
    expect(String((items[0]!.raw as { html?: string }).html)).toContain("Teaching Assistant");
  });

  it("throws when the source has no selectors configured", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch("<html></html>") });
    await expect(
      adapter.fetch({ id: "s", type: "HTML", url: "https://example.com" }),
    ).rejects.toThrow(/selectors/i);
  });

  it("throws on a non-OK HTTP response", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch("nope", 500) });
    await expect(adapter.fetch(jobsSource)).rejects.toThrow();
  });
});

// A minimal Rotherham-area allow-list; the real seed uses ROTHERHAM_TOWNS.
const ALLOW = ["rotherham", "brinsworth", "maltby", "whiston", "wath"];

const eventbriteSource: AdapterSource = {
  id: "src_eventbrite",
  type: "HTML",
  url: "https://www.eventbrite.co.uk/d/united-kingdom--rotherham/events/",
  config: { strategy: "jsonLd", localityAllow: ALLOW },
};

describe("HtmlAdapter — jsonLd strategy (Eventbrite fixture)", () => {
  it("extracts events from the ld+json ItemList, filtered to allowed localities", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch(fixture("eventbrite.html")) });
    const items = await adapter.fetch(eventbriteSource);

    // Fixture: 24 events — 12 Rotherham, 3 Brinsworth, 1 Whiston, 8 with no
    // locality (dropped). 16 survive the locality filter.
    expect(items).toHaveLength(16);
    expect(items.length).toBeLessThan(24); // some were filtered out
  });

  it("keeps only Rotherham-area events — no global junk", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch(fixture("eventbrite.html")) });
    const items = await adapter.fetch(eventbriteSource);

    for (const it of items) {
      const locality = (
        it.raw as { jsonLd?: { location?: { address?: { addressLocality?: string } } } }
      ).jsonLd?.location?.address?.addressLocality?.toLowerCase();
      expect(ALLOW).toContain(locality);
    }
    // Sanity: the fixture is known to contain out-of-area entries (e.g. Meadowhall,
    // .ca events) that must not survive.
    const titles = items.map((i) => i.title.toLowerCase()).join(" | ");
    expect(titles).not.toContain("meadowhall");
  });

  it("maps event fields (title, canonical link, summary, image)", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch(fixture("eventbrite.html")) });
    const items = await adapter.fetch(eventbriteSource);

    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.link).toMatch(/eventbrite\.[a-z.]+\/e\//);
    }
    // At least one event carries a description and an image in the fixture.
    expect(items.some((i) => i.summary)).toBe(true);
    expect(items.some((i) => i.imageUrl)).toBe(true);
  });

  it("with no localityAllow, returns every well-formed event", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch(fixture("eventbrite.html")) });
    const items = await adapter.fetch({
      ...eventbriteSource,
      config: { strategy: "jsonLd" },
    });
    // All 24 list entries have name+url, so none are dropped as malformed.
    expect(items).toHaveLength(24);
  });

  it("returns [] when the page has no ld+json (no throw)", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch("<html><body>no data</body></html>") });
    const items = await adapter.fetch(eventbriteSource);
    expect(items).toEqual([]);
  });
});

const nhsSource: AdapterSource = {
  id: "src_nhs_jobs",
  type: "HTML",
  url: "https://www.jobs.nhs.uk/candidate/search/results?location=Rotherham",
  config: {
    selectors: {
      item: 'li[data-test="search-result"]',
      title: '[data-test="search-result-job-title"]',
      link: '[data-test="search-result-job-title"]',
      excerpt: '[data-test="search-result-location"]',
    },
  },
};

describe("HtmlAdapter — NHS Jobs (live fixture, Cheerio cards)", () => {
  it("extracts the page-1 job results with titles and absolute links", async () => {
    const adapter = new HtmlAdapter({ fetchImpl: stubFetch(fixture("nhs-jobs.html")) });
    const items = await adapter.fetch(nhsSource);

    expect(items.length).toBe(10); // 10 results server-rendered on page 1
    for (const it of items) {
      expect(it.title).toBeTruthy();
      // Relative /candidate/jobadvert/... hrefs resolve against the source host.
      expect(it.link).toMatch(/^https:\/\/www\.jobs\.nhs\.uk\/candidate\/jobadvert\//);
    }
    // The location line is captured as the excerpt.
    expect(items.some((i) => i.summary)).toBe(true);
  });
});
