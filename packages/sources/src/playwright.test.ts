import { describe, it, expect, vi } from "vitest";
import type { Browser } from "playwright";
import { PlaywrightAdapter } from "./playwright.js";
import type { AdapterSource } from "./adapter.js";

// A rendered-DOM fixture in the shape of the Millers Nuxt news list (post-hydration:
// the cards exist only after JS runs, which is why this source needs a browser).
const RENDERED_HTML = `<!doctype html><html><body>
  <div class="news-list">
    <a class="news-card" href="/news/millers-sign-new-striker">
      <h3 class="news-card__title">Millers sign new striker</h3>
      <img src="/img/striker.jpg" />
      <time class="news-card__date">6 July 2026</time>
    </a>
    <a class="news-card" href="https://www.themillers.co.uk/news/match-report">
      <h3 class="news-card__title">Match report: Rotherham 2-1 Barnsley</h3>
    </a>
    <a class="news-card" href="/news/no-title-card"><h3 class="news-card__title"></h3></a>
  </div>
</body></html>`;

/**
 * A minimal fake of the Playwright Browser surface the adapter touches:
 * browser.newContext → context.newPage → page.goto / waitForSelector / locator /
 * content / waitForTimeout, then context.close. Records calls so we can assert the
 * recipe ran (consent, steps, waitFor).
 */
function stubBrowser(html: string) {
  const calls = { goto: [] as string[], waitForSelector: [] as string[], clicks: [] as string[] };
  const locator = (selector: string) => ({
    first: () => ({
      count: async () => (selector.includes("consent") || selector.includes("show-more") ? 0 : 1),
      isVisible: async () => false,
      click: async () => {
        calls.clicks.push(selector);
      },
      selectOption: async () => {},
      fill: async () => {},
    }),
  });
  const page = {
    goto: async (url: string) => {
      calls.goto.push(url);
      return null;
    },
    waitForSelector: async (sel: string) => {
      calls.waitForSelector.push(sel);
      return {};
    },
    waitForTimeout: async () => {},
    locator,
    content: async () => html,
  };
  const context = { newPage: async () => page, close: vi.fn(async () => {}) };
  const browser = { newContext: async () => context } as unknown as Browser;
  return { browser, context, calls };
}

const millersSource: AdapterSource = {
  id: "src_millers",
  type: "PLAYWRIGHT",
  url: "https://www.themillers.co.uk/news/",
  config: {
    playwright: {
      waitFor: ".news-card",
      consentClick: "#onetrust-accept-btn-handler",
    },
    selectors: {
      item: ".news-card",
      title: ".news-card__title",
      link: ".news-card", // the card container is itself the anchor
      image: "img",
      excerpt: ".news-card__date",
    },
  },
};

describe("PlaywrightAdapter (stubbed browser)", () => {
  it("renders then scrapes cards from the hydrated DOM", async () => {
    const { browser } = stubBrowser(RENDERED_HTML);
    const adapter = new PlaywrightAdapter({ browser });
    const items = await adapter.fetch(millersSource);

    // The two well-formed cards survive; the title-less third is dropped.
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("Millers sign new striker");
    // Relative href resolves against the source URL; absolute is left as-is.
    expect(items[0]!.link).toBe("https://www.themillers.co.uk/news/millers-sign-new-striker");
    expect(items[1]!.link).toBe("https://www.themillers.co.uk/news/match-report");
    expect(items[0]!.imageUrl).toBe("https://www.themillers.co.uk/img/striker.jpg");
    expect(items[0]!.summary).toBe("6 July 2026");
  });

  it("waits for the configured selector before scraping", async () => {
    const { browser, calls } = stubBrowser(RENDERED_HTML);
    await new PlaywrightAdapter({ browser }).fetch(millersSource);
    expect(calls.goto).toContain("https://www.themillers.co.uk/news/");
    expect(calls.waitForSelector).toContain(".news-card");
  });

  it("always closes the context, even after a scrape", async () => {
    const { browser, context } = stubBrowser(RENDERED_HTML);
    await new PlaywrightAdapter({ browser }).fetch(millersSource);
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("falls back to the source URL when items have no usable href (iTrent)", async () => {
    // iTrent-shaped rows: real titles, but the link is javascript:void(0).
    const itrentHtml = `<!doctype html><html><body>
      <div class="Mhr-jobDetailTitleContainer">
        <a href="javascript:void(0);" class="Mhr-jobDetailTitleLink"><span>Technical Assistant</span></a>
      </div>
      <div class="Mhr-jobDetailTitleContainer">
        <a href="javascript:void(0);" class="Mhr-jobDetailTitleLink"><span>Ranger</span></a>
      </div>
    </body></html>`;
    const { browser } = stubBrowser(itrentHtml);
    const itrentSource: AdapterSource = {
      id: "src_itrent",
      type: "PLAYWRIGHT",
      url: "https://ce0351li.webitrent.com/.../ETREC179GF.open?WVID=x",
      config: {
        playwright: { waitFor: ".Mhr-jobDetailTitleContainer", linkFallbackToSource: true },
        selectors: {
          item: ".Mhr-jobDetailTitleContainer",
          title: "a.Mhr-jobDetailTitleLink",
          link: "a.Mhr-jobDetailTitleLink",
        },
      },
    };
    const items = await new PlaywrightAdapter({ browser }).fetch(itrentSource);

    expect(items.map((i) => i.title)).toEqual(["Technical Assistant", "Ranger"]);
    // Both fall back to the (shared) search-page URL — no javascript: link stored.
    expect(items.every((i) => i.link === itrentSource.url)).toBe(true);
  });

  it("drops items with no usable href when fallback is OFF", async () => {
    const html = `<div class="c"><a class="t" href="javascript:void(0);">Only title</a></div>`;
    const { browser } = stubBrowser(`<!doctype html><html><body>${html}</body></html>`);
    const src: AdapterSource = {
      id: "s",
      type: "PLAYWRIGHT",
      url: "https://x.test",
      config: {
        playwright: { waitFor: ".c" }, // linkFallbackToSource defaults false
        selectors: { item: ".c", title: ".t", link: ".t" },
      },
    };
    const items = await new PlaywrightAdapter({ browser }).fetch(src);
    expect(items).toEqual([]);
  });

  it("throws when waitFor / selectors are missing", async () => {
    const { browser } = stubBrowser(RENDERED_HTML);
    const adapter = new PlaywrightAdapter({ browser });
    await expect(
      adapter.fetch({ id: "s", type: "PLAYWRIGHT", url: "https://x.test", config: {} }),
    ).rejects.toThrow(/waitFor/i);
  });
});
