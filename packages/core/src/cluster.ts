/**
 * Cross-publisher story clustering — pure, deterministic title matching so the
 * same story covered by different outlets (Advertiser, The Star, BBC, …) with
 * different URLs and differently-worded headlines can be grouped.
 *
 * This is *not* the exact dedup (that's `contentHash`, a URL+title hash with a DB
 * unique constraint). This is the fuzzy layer that runs on items which already
 * survived exact dedup. See docs/plans/dedup-clustering.md.
 *
 * Approach: normalize a headline to a set of meaningful tokens, then compare two
 * sets with the Sørensen–Dice coefficient. Deliberately conservative — see
 * CLUSTER_THRESHOLD.
 */

/**
 * Similarity at or above which two titles are treated as the same story.
 *
 * Set high (0.8) on purpose: we would rather miss a genuine duplicate than merge
 * two distinct stories (a wrong merge hides real coverage; a missed merge just
 * shows one extra row). Tune downward against real Advertiser/Star data once we
 * can measure the miss rate. Exposed so the worker and tests share one value.
 */
export const CLUSTER_THRESHOLD = 0.8;

/**
 * Very common English words that carry no story identity. Kept small on purpose —
 * an over-eager stopword list strips the words that distinguish two stories.
 */
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "by",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "s", // possessive/plural remnant after punctuation stripping ("rotherham's" -> "rotherham", "s")
]);

/**
 * Local-noise tokens that appear in a huge share of Rotherham headlines and so
 * inflate similarity between *unrelated* local stories. Dropping them means two
 * headlines cluster on what actually differs, not on the fact that both mention
 * Rotherham / the football club. NB: this is the *opposite* intent to the
 * relevance keyword list — there these words are signal; here they are noise.
 */
const LOCAL_NOISE = new Set(["rotherham", "millers", "rufc", "united"]);

/**
 * Normalize a headline into an order-independent set of meaningful tokens:
 * lowercase, strip punctuation to spaces, split on whitespace, then drop
 * stopwords, local-noise and pure-numeric-free empties. The returned Set is the
 * unit both `similarity` and equality build on.
 *
 * Pure and deterministic — the same title always yields the same set.
 */
export function clusterKey(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    // Replace anything that isn't a letter, digit or whitespace with a space, so
    // "2-1" -> "2 1" and "council's" -> "council s".
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !LOCAL_NOISE.has(t));
  return new Set(tokens);
}

/** Count of elements present in both sets. */
function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  // Iterate the smaller set for a tiny constant-factor win.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) n++;
  return n;
}

/**
 * Sørensen–Dice similarity of two headlines, in [0, 1]: `2·|A∩B| / (|A|+|B|)`
 * over their normalized token sets. 1 = identical token sets, 0 = disjoint.
 *
 * Two empty sets (titles that normalize to nothing) score 0, not 1 — we never
 * want to merge two content-free headlines. Pure and symmetric.
 */
export function similarity(titleA: string, titleB: string): number {
  const a = clusterKey(titleA);
  const b = clusterKey(titleB);
  const total = a.size + b.size;
  if (total === 0) return 0;
  return (2 * intersectionSize(a, b)) / total;
}

/**
 * True if two titles are similar enough to be the same story (≥ CLUSTER_THRESHOLD).
 * The single predicate the worker uses so the threshold lives in one place.
 */
export function sameStory(titleA: string, titleB: string): boolean {
  return similarity(titleA, titleB) >= CLUSTER_THRESHOLD;
}
