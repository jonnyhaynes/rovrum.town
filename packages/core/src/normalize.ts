import { contentHash } from "./content-hash.js";
import type { FetchedItem, NormalizedItem, SourceLike } from "./types.js";

/** Max excerpt length — a snippet, never full body content (aggregator boundary). */
const EXCERPT_MAX = 500;

/** A minimal set of named HTML entities we expect in feed summaries. */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Strip HTML tags and decode common entities down to a plain-text snippet. */
function toExcerpt(html: string | undefined): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, " ") // drop tags
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();

  if (text.length <= EXCERPT_MAX) return text;
  // Trim to the last word boundary before the cap, then add an ellipsis.
  const cut = text.slice(0, EXCERPT_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Turn a raw adapter item into the persistable shape. Pure: carries the source's
 * vertical, cleans the summary to a plain-text excerpt (never full body), keeps
 * `raw` verbatim, and computes the dedup hash. Optional fields absent from the
 * source become `null`.
 */
export function normalize(source: SourceLike, item: FetchedItem): NormalizedItem {
  return {
    sourceId: source.id,
    vertical: source.vertical,
    title: item.title.trim(),
    excerpt: toExcerpt(item.summary),
    canonicalUrl: item.link,
    imageUrl: item.imageUrl ?? null,
    author: item.author ?? null,
    publishedAt: item.publishedAt ?? null,
    contentHash: contentHash({ title: item.title, link: item.link }),
    raw: item.raw,
  };
}
