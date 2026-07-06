import type { FetchDeps, SourceAdapter } from "./adapter.js";
import { RssAdapter } from "./rss.js";
import { HtmlAdapter } from "./html.js";

/** Select the adapter for a source `type`. API is not implemented this phase. */
export function getAdapter(type: "RSS" | "HTML" | "API", deps?: FetchDeps): SourceAdapter {
  switch (type) {
    case "RSS":
      return new RssAdapter(deps);
    case "HTML":
      return new HtmlAdapter(deps);
    default:
      throw new Error(`Unsupported source type: ${type}`);
  }
}
