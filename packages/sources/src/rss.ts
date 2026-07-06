import Parser from "rss-parser";
import type { FetchedItem } from "@rovrum/core";
import type { AdapterSource, FetchDeps, SourceAdapter } from "./adapter.js";

const DEFAULT_UA = "Mozilla/5.0 (compatible; RovrumBot/1.0; +https://www.rovrum.town)";

/** Extra RSS/Atom fields rss-parser doesn't map onto its default Item type. */
type CustomItem = {
  /** Atom `<author><name>` — rss-parser surfaces it here, not on `creator`. */
  author?: string;
  "media:content"?: { $?: { url?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
};

/**
 * RSS/Atom adapter. Fetches with a browser-ish User-Agent (several feeds 403 a
 * bare client), parses both RSS 2.0 and Atom via rss-parser, and maps entries to
 * FetchedItem[]. Malformed entries (no title or link) are skipped, not fatal.
 */
export class RssAdapter implements SourceAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly parser: Parser<unknown, CustomItem>;

  constructor(deps: FetchDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.userAgent = deps.userAgent ?? DEFAULT_UA;
    this.parser = new Parser<unknown, CustomItem>({
      customFields: {
        item: ["media:content", "media:thumbnail"],
      },
    });
  }

  async fetch(source: AdapterSource): Promise<FetchedItem[]> {
    const res = await this.fetchImpl(source.url, {
      headers: {
        "user-agent": this.userAgent,
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      throw new Error(`RSS fetch failed: ${res.status} ${res.statusText} for ${source.url}`);
    }
    const xml = await res.text();
    const feed = await this.parser.parseString(xml);

    const items: FetchedItem[] = [];
    for (const entry of feed.items) {
      const title = entry.title?.trim();
      const link = entry.link?.trim();
      // Skip malformed entries rather than failing the whole run.
      if (!title || !link) continue;

      items.push({
        title,
        link,
        summary: entry.contentSnippet ?? entry.content ?? entry.summary,
        author: entry.creator ?? entry.author?.trim(),
        publishedAt: entry.isoDate ? new Date(entry.isoDate) : undefined,
        imageUrl:
          entry.enclosure?.url ??
          entry["media:content"]?.$?.url ??
          entry["media:thumbnail"]?.$?.url,
        raw: entry,
      });
    }
    return items;
  }
}
