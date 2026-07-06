// @rovrum/core — pure domain logic for the ingestion pipeline. No network, no DB.
export { normalize } from "./normalize.js";
export { contentHash, canonicalizeUrl } from "./content-hash.js";
export { isRotherhamRelevant } from "./relevance.js";
export type { FetchedItem, NormalizedItem, SourceLike, Vertical } from "./types.js";
