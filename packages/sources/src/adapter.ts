import type { Browser } from "playwright";
import type { FetchedItem } from "@rovrum/core";

/** A source `type`, mirroring the DB `SourceType` enum. */
export type SourceType = "RSS" | "HTML" | "API" | "PLAYWRIGHT";

/** The Source fields an adapter needs. Structural subset of the DB `Source` row. */
export interface AdapterSource {
  id: string;
  type: SourceType;
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
  /** Recipe for the Playwright adapter (JS-rendered sources). */
  playwright?: PlaywrightConfig;
}

/**
 * Per-site recipe for the Playwright adapter. The *mechanism* (launch a page, wait,
 * dismiss consent, click "show more", scrape) is source-agnostic; the selectors and
 * steps here are the per-site data. Item extraction reuses `SourceConfig.selectors`
 * against the rendered DOM.
 */
export interface PlaywrightConfig {
  /** Selector to wait for before scraping (the list must have hydrated). */
  waitFor: string;
  /**
   * Extra settle time (ms) after `waitFor` matches, before scraping. Some apps
   * render the first item early then hydrate the rest — waiting for one match
   * would scrape a partial list. Defaults to 0.
   */
  settleMs?: number;
  /** Optional selector to click once to dismiss a cookie/consent banner. */
  consentClick?: string;
  /** Optional "load more"/pagination selector, clicked repeatedly (bounded). */
  showMore?: string;
  /** Max times to click `showMore` (safety bound against runaway loops). */
  showMoreLimit?: number;
  /** Optional ordered pre-scrape actions (e.g. iTrent: select region, submit). */
  steps?: PlaywrightStep[];
  /**
   * When true, items whose link selector yields no usable href fall back to the
   * source (page) URL as their canonical link, instead of being dropped. For portals
   * (e.g. iTrent) that render real items but expose no per-item URL — accepted with
   * the trade-off that all such items share one link. Off by default.
   */
  linkFallbackToSource?: boolean;
}

/** A single typed pre-scrape action. Not arbitrary code — a small fixed vocabulary. */
export type PlaywrightStep =
  | { action: "click"; selector: string }
  | { action: "select"; selector: string; value: string }
  | { action: "fill"; selector: string; value: string }
  | { action: "waitFor"; selector: string };

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
  /**
   * A shared, long-lived Playwright browser for the PlaywrightAdapter. The worker
   * owns it (launch at boot, close on shutdown) and injects it here — launching
   * Chromium per fetch would be far too expensive. The adapter creates a fresh
   * context+page per fetch and closes them after. Omitted for RSS/HTML sources.
   */
  browser?: Browser;
}

export type { FetchedItem };
