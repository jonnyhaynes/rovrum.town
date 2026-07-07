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
  /** CSS selectors for the HTML adapter. */
  selectors?: HtmlSelectors;
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
