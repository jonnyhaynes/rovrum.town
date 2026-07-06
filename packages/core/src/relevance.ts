/**
 * Rotherham keywords: the town, its surrounding areas/villages, and the football
 * club. Used to filter regional feeds (The Star, BBC South Yorkshire) down to
 * Rotherham-relevant items. Lowercase; matched as whole words. Maintainable — add
 * areas as coverage gaps appear.
 */
const KEYWORDS = [
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
  "millers", // Rotherham United's nickname
  "rufc",
];

// One case-insensitive regex, alternating the keywords with word boundaries so
// "Aston" matches but "astonishing" does not. Multi-word entries are escaped and
// keep their internal space.
const PATTERN = new RegExp(
  `\\b(?:${KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

/** True if the text mentions Rotherham or a nearby area/team (whole-word match). */
export function isRotherhamRelevant(text: string): boolean {
  if (!text || !text.trim()) return false;
  return PATTERN.test(text);
}
