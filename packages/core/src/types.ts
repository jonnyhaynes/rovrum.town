// Domain types for the ingestion pipeline. `@rovrum/core` is pure — no network,
// no DB. We reference the DB's generated types via `import type` only, so nothing
// here pulls the Prisma runtime into a consumer.
import type { Vertical } from "@rovrum/db";

export type { Vertical };

/**
 * The raw shape a source adapter yields for one item, before normalization.
 * Adapters map their source's payload into this; `raw` keeps the untouched
 * original so we never lose data the model doesn't yet capture.
 */
export interface FetchedItem {
  title: string;
  /** Link to the original item — becomes the canonical URL after normalization. */
  link: string;
  /** Summary/description from the source; may contain HTML. */
  summary?: string;
  author?: string;
  publishedAt?: Date;
  imageUrl?: string;
  /** The untouched original payload from the source. */
  raw: unknown;
}

/**
 * The minimal `Source` fields normalization/relevance need. A structural subset
 * of the DB `Source` model, so the real Prisma row satisfies it without coupling
 * `@rovrum/core` to the Prisma runtime.
 */
export interface SourceLike {
  id: string;
  vertical: Vertical;
  /** Regional feeds (The Star, BBC South Yorkshire) carry non-Rotherham items. */
  regional?: boolean;
}

/**
 * The normalized item ready to persist — a plain object matching the writable
 * columns of `ContentItem`. The worker hands this to Prisma's `createMany`.
 * Aggregator boundary: `excerpt` is a snippet only, never full body content.
 */
export interface NormalizedItem {
  sourceId: string;
  vertical: Vertical;
  title: string;
  excerpt: string;
  canonicalUrl: string;
  imageUrl: string | null;
  author: string | null;
  publishedAt: Date | null;
  contentHash: string;
  raw: unknown;
}
