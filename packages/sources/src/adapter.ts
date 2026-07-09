import type { FetchedItem } from "@rovrum/core";

/** The Source fields an adapter needs. Structural subset of the DB `Source` row. */
export interface AdapterSource {
  id: string;
  type: "RSS" | "HTML" | "API";
  url: string;
  /** Per-source config: HTML selectors, flags, etc. */
  config?: SourceConfig | null;
}

/** Shape of a Source's `config` jsonb relevant to fetching. */
export interface SourceConfig {
  /** Regional feed → items get the Rotherham relevance filter (applied by the worker). */
  regional?: boolean;
  /** CSS selectors for the HTML adapter's default card-scraping strategy. */
  selectors?: HtmlSelectors;
  /**
   * Extraction strategy for the HTML adapter. `"cards"` (default) uses `selectors`;
   * `"jsonLd"` parses the page's `application/ld+json` `ItemList` instead — more
   * robust for pages (e.g. Eventbrite) that ship structured event data.
   */
  strategy?: "cards" | "jsonLd";
  /**
   * When set, the HTML adapter keeps only items whose location matches one of these
   * localities (case-insensitive, whole-word). Applied by the `jsonLd` strategy
   * against each event's `location.address.addressLocality`. Scopes loose "near X"
   * listing pages down to genuine local results. Empty/undefined → no locality filter.
   */
  localityAllow?: string[];
}

/** CSS selectors driving the Cheerio HTML adapter. */
export interface HtmlSelectors {
  /** Selector for each item container. */
  item: string;
  /** Selectors, relative to an item, for each field. */
  title: string;
  link: string;
  excerpt?: string;
  image?: string;
}

/** One adapter per source *type*. Fetches and normalizes to FetchedItem[]; no DB. */
export interface SourceAdapter {
  fetch(source: AdapterSource): Promise<FetchedItem[]>;
}

/** Fetch options shared by adapters (injectable for tests). */
export interface FetchDeps {
  /** Fetch implementation — defaults to global fetch; overridable in tests. */
  fetchImpl?: typeof fetch;
  /** User-Agent to send (several feeds 403 a bare client). */
  userAgent?: string;
}

export type { FetchedItem };
