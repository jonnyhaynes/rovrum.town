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
