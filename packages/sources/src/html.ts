import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { FetchedItem } from "@rovrum/core";
import type {
  AdapterSource,
  FetchDeps,
  HtmlSelectors,
  SourceConfig,
  SourceAdapter,
} from "./adapter.js";

const DEFAULT_UA = "Mozilla/5.0 (compatible; RovrumBot/1.0; +https://www.rovrum.town)";

/**
 * Cheerio HTML adapter for server-rendered listing pages. Two strategies, chosen by
 * `source.config.strategy`:
 *
 * - `"cards"` (default): scrape repeated item containers via `config.selectors`.
 * - `"jsonLd"`: parse the page's `application/ld+json` `ItemList` (structured event
 *   data), optionally filtered by `config.localityAllow`. More robust than card
 *   scraping for pages that ship structured data (e.g. Eventbrite).
 *
 * No JavaScript execution — that's the deferred Playwright adapter (Phase 1b).
 * Relative links/images resolve against the source URL.
 */
export class HtmlAdapter implements SourceAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(deps: FetchDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.userAgent = deps.userAgent ?? DEFAULT_UA;
  }

  async fetch(source: AdapterSource): Promise<FetchedItem[]> {
    const config = source.config ?? {};
    const html = await this.fetchHtml(source.url);
    const $ = cheerio.load(html);

    if (config.strategy === "jsonLd") {
      return extractJsonLd($, source.url, config);
    }
    return extractCards($, source, config.selectors);
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await this.fetchImpl(url, {
      headers: { "user-agent": this.userAgent, accept: "text/html,*/*" },
    });
    if (!res.ok) {
      throw new Error(`HTML fetch failed: ${res.status} ${res.statusText} for ${url}`);
    }
    return res.text();
  }
}

// ── "cards" strategy: repeated containers via CSS selectors ──────────────────

function extractCards(
  $: cheerio.CheerioAPI,
  source: AdapterSource,
  selectors: HtmlSelectors | undefined,
): FetchedItem[] {
  if (!selectors?.item || !selectors.title || !selectors.link) {
    throw new Error(`HTML source ${source.id} needs config.selectors with item/title/link`);
  }
  const items: FetchedItem[] = [];
  $(selectors.item).each((_, el) => {
    const item = extractCardItem($, $(el), selectors, source.url);
    if (item) items.push(item);
  });
  return items;
}

function extractCardItem(
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

// ── "jsonLd" strategy: structured ItemList ───────────────────────────────────

/** Minimal shape of the schema.org fields we read; everything else is preserved in `raw`. */
interface JsonLdEvent {
  name?: string;
  url?: string;
  description?: string;
  image?: string | string[];
  location?: {
    address?: { addressLocality?: string };
  };
}

function extractJsonLd(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  config: SourceConfig,
): FetchedItem[] {
  const events = parseItemListEvents($);
  const allow = normaliseAllow(config.localityAllow);

  const items: FetchedItem[] = [];
  for (const ev of events) {
    const title = ev.name?.trim();
    const href = ev.url?.trim();
    if (!title || !href) continue; // malformed entry

    const locality = ev.location?.address?.addressLocality?.trim();
    if (allow && !localityAllowed(locality, allow)) continue; // out of area

    const image = Array.isArray(ev.image) ? ev.image[0] : ev.image;
    items.push({
      title,
      link: resolve(href, baseUrl),
      summary: ev.description?.trim() || undefined,
      imageUrl: image ? resolve(image, baseUrl) : undefined,
      raw: { jsonLd: ev },
    });
  }
  return items;
}

/** Parse every `application/ld+json` block and collect events from any `ItemList`. */
function parseItemListEvents($: cheerio.CheerioAPI): JsonLdEvent[] {
  const events: JsonLdEvent[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return; // skip malformed JSON-LD rather than fail the whole fetch
    }
    for (const node of Array.isArray(data) ? data : [data]) {
      const list = (node as { itemListElement?: unknown }).itemListElement;
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const item = (entry as { item?: JsonLdEvent }).item;
        if (item && typeof item === "object") events.push(item);
      }
    }
  });
  return events;
}

function normaliseAllow(allow: string[] | undefined): string[] | null {
  if (!allow || allow.length === 0) return null;
  return allow.map((a) => a.trim().toLowerCase()).filter(Boolean);
}

/** Whole-word, case-insensitive match of the locality against the allow-list. */
function localityAllowed(locality: string | undefined, allow: string[]): boolean {
  if (!locality) return false;
  const words = locality
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return allow.some((a) =>
    a.includes(" ") ? locality.toLowerCase().includes(a) : words.includes(a),
  );
}

function resolve(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}
