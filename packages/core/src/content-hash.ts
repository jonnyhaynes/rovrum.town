import { createHash } from "node:crypto";

/** Query params that carry no meaning for identity — analytics/click tracking. */
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_NAMES = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (TRACKING_PARAM_NAMES.has(lower)) return true;
  return TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Canonicalize a URL for dedup: lowercase the host, drop tracking params and the
 * fragment, and remove a trailing slash. Leaves the path case and meaningful
 * query params intact. Returns the input unchanged if it isn't a parseable URL.
 */
export function canonicalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  for (const key of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(key)) parsed.searchParams.delete(key);
  }

  // Drop a trailing slash on the path (but keep root "/").
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  let out = parsed.toString();
  // URL.toString() re-adds a trailing slash for empty paths; normalize that away
  // only when there was no path to begin with is unnecessary — leave as-is.
  if (out.endsWith("/") && !url.endsWith("/") && parsed.pathname === "/") {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Stable dedup key for a content item: SHA-256 over the canonicalized URL + title.
 * Deterministic and pure — the same item always hashes to the same value, and
 * items that differ only by tracking params/fragment/host-case collapse together.
 */
export function contentHash(item: { title: string; link: string }): string {
  const key = `${canonicalizeUrl(item.link)}\n${item.title.trim()}`;
  return createHash("sha256").update(key, "utf8").digest("hex");
}
