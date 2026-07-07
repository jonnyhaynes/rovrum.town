import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { FetchedItem } from "@rovrum/core";
import type { AdapterSource, FetchDeps, HtmlSelectors, SourceAdapter } from "./adapter.js";

const DEFAULT_UA = "Mozilla/5.0 (compatible; RovrumBot/1.0; +https://www.rovrum.town)";

/**
 * Cheerio HTML adapter for server-rendered listing pages. Selectors come from
 * `source.config.selectors`, so adding a new server-rendered source is a data
 * change, not code. No JavaScript execution — that's the deferred Playwright
 * adapter (Phase 1b). Relative links/images resolve against the source URL.
 */
export class HtmlAdapter implements SourceAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(deps: FetchDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.userAgent = deps.userAgent ?? DEFAULT_UA;
  }

  async fetch(source: AdapterSource): Promise<FetchedItem[]> {
    const selectors = source.config?.selectors;
    if (!selectors?.item || !selectors.title || !selectors.link) {
      throw new Error(`HTML source ${source.id} needs config.selectors with item/title/link`);
    }

    const res = await this.fetchImpl(source.url, {
      headers: { "user-agent": this.userAgent, accept: "text/html,*/*" },
    });
    if (!res.ok) {
      throw new Error(`HTML fetch failed: ${res.status} ${res.statusText} for ${source.url}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const items: FetchedItem[] = [];
    $(selectors.item).each((_, el) => {
      const item = extractItem($, $(el), selectors, source.url);
      if (item) items.push(item);
    });
    return items;
  }
}

function extractItem(
  $: cheerio.CheerioAPI,
  $el: Cheerio<AnyNode>,
  selectors: HtmlSelectors,
  baseUrl: string,
): FetchedItem | null {
  const title = $el.find(selectors.title).first().text().trim();
  const href = $el.find(selectors.link).first().attr("href");
  // Skip malformed items — need at least a title and a link.
  if (!title || !href) return null;

  const summary = selectors.excerpt
    ? $el.find(selectors.excerpt).first().text().trim() || undefined
    : undefined;
  const imgSrc = selectors.image ? $el.find(selectors.image).first().attr("src") : undefined;

  return {
    title,
    link: resolve(href, baseUrl),
    summary,
    imageUrl: imgSrc ? resolve(imgSrc, baseUrl) : undefined,
    raw: { html: $.html($el) },
  };
}

function resolve(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}
