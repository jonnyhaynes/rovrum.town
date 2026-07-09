import type { FetchDeps, SourceAdapter, SourceType } from "./adapter.js";
import { RssAdapter } from "./rss.js";
import { HtmlAdapter } from "./html.js";
import { PlaywrightAdapter } from "./playwright.js";

/** Select the adapter for a source `type`. API is not implemented this phase. */
export function getAdapter(type: SourceType, deps?: FetchDeps): SourceAdapter {
  switch (type) {
    case "RSS":
      return new RssAdapter(deps);
    case "HTML":
      return new HtmlAdapter(deps);
    case "PLAYWRIGHT":
      return new PlaywrightAdapter(deps);
    default:
      throw new Error(`Unsupported source type: ${type}`);
  }
}
