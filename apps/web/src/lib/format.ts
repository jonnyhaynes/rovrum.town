// Small pure formatting helpers for the UI. No DB, no framework.

/**
 * A short human relative time, e.g. "3h ago", "2d ago", "just now". Falls back
 * to an absolute date beyond a week (older news isn't helped by "in 340 days").
 * `now` is injectable so it's testable and deterministic in static builds.
 */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day <= 7) return `${day}d ago`;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
