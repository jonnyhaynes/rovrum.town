/**
 * Rotherham-area towns, villages and suburbs — the geographic vocabulary of what
 * "counts as Rotherham". Lowercase; matched as whole words. Maintainable — add
 * areas as coverage gaps appear. This is the single source of truth: the regional
 * relevance keyword filter and the Eventbrite locality filter both build on it.
 */
export const ROTHERHAM_TOWNS = [
  "rotherham",
  "maltby",
  "wath", // Wath-upon-Dearne
  "rawmarsh",
  "dinnington",
  "swinton",
  "kiveton",
  "thurcroft",
  "aston",
  "wickersley",
  "bramley",
  "brinsworth",
  "catcliffe",
  "thorpe hesley",
  "wentworth",
  "wombwell",
  "hellaby",
  "treeton",
  "kimberworth",
  "greasbrough",
  "whiston",
] as const;

/**
 * Non-geographic Rotherham keywords (the football club) that also flag a regional
 * feed item as relevant, but are *not* place names — so they don't belong in the
 * town list used for locality matching.
 */
const EXTRA_KEYWORDS = [
  "millers", // Rotherham United's nickname
  "rufc",
] as const;

const RELEVANCE_KEYWORDS = [...ROTHERHAM_TOWNS, ...EXTRA_KEYWORDS];

function wholeWordPattern(words: readonly string[]): RegExp {
  // Alternate the words with word boundaries so "Aston" matches but "astonishing"
  // does not. Escape each and keep any internal space for multi-word entries.
  return new RegExp(
    `\\b(?:${words.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "i",
  );
}

const RELEVANCE_PATTERN = wholeWordPattern(RELEVANCE_KEYWORDS);
const LOCALITY_PATTERN = wholeWordPattern(ROTHERHAM_TOWNS);

/** True if the text mentions Rotherham or a nearby area/team (whole-word match). */
export function isRotherhamRelevant(text: string): boolean {
  if (!text || !text.trim()) return false;
  return RELEVANCE_PATTERN.test(text);
}

/**
 * True if a place/locality string names a Rotherham-area town (whole-word match).
 * Used to filter structured location data (e.g. Eventbrite `addressLocality`),
 * where only place names count — the football-club keywords must not match.
 */
export function isRotherhamLocality(locality: string): boolean {
  if (!locality || !locality.trim()) return false;
  return LOCALITY_PATTERN.test(locality);
}
