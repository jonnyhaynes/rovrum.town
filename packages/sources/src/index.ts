// @rovrum/sources — one adapter per source type. Fetches and normalizes to
// FetchedItem[]; no DB access (the worker persists).
export { getAdapter } from "./registry.js";
export { RssAdapter } from "./rss.js";
export { HtmlAdapter } from "./html.js";
export { SEED_SOURCES } from "./seed-data.js";
export type { SeedSource } from "./seed-data.js";
export type {
  SourceAdapter,
  AdapterSource,
  SourceConfig,
  HtmlSelectors,
  FetchDeps,
  FetchedItem,
} from "./adapter.js";
