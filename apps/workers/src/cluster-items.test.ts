import { describe, it, expect } from "vitest";
import { shouldReplaceCanonical } from "./cluster-items.js";

const date = (iso: string) => new Date(iso);

describe("shouldReplaceCanonical", () => {
  it("prefers the earlier publishedAt", () => {
    const incumbent = { publishedAt: date("2026-07-15T12:00:00Z"), regional: false };
    const earlier = { publishedAt: date("2026-07-15T09:00:00Z"), regional: false };
    const later = { publishedAt: date("2026-07-15T15:00:00Z"), regional: false };
    expect(shouldReplaceCanonical(incumbent, earlier)).toBe(true);
    expect(shouldReplaceCanonical(incumbent, later)).toBe(false);
  });

  it("prefers a dated challenger over an undated incumbent", () => {
    expect(
      shouldReplaceCanonical(
        { publishedAt: null, regional: false },
        { publishedAt: date("2026-07-15T09:00:00Z"), regional: false },
      ),
    ).toBe(true);
  });

  it("keeps a dated incumbent over an undated challenger", () => {
    expect(
      shouldReplaceCanonical(
        { publishedAt: date("2026-07-15T09:00:00Z"), regional: false },
        { publishedAt: null, regional: false },
      ),
    ).toBe(false);
  });

  it("on equal times, native (non-regional) beats regional", () => {
    const t = date("2026-07-15T09:00:00Z");
    // incumbent regional, challenger native -> replace
    expect(shouldReplaceCanonical({ publishedAt: t, regional: true }, { publishedAt: t, regional: false })).toBe(true);
    // incumbent native, challenger regional -> keep
    expect(shouldReplaceCanonical({ publishedAt: t, regional: false }, { publishedAt: t, regional: true })).toBe(false);
  });

  it("on a full tie (same time, same regional), keeps the incumbent (stable)", () => {
    const t = date("2026-07-15T09:00:00Z");
    expect(shouldReplaceCanonical({ publishedAt: t, regional: false }, { publishedAt: t, regional: false })).toBe(false);
    expect(shouldReplaceCanonical({ publishedAt: t, regional: true }, { publishedAt: t, regional: true })).toBe(false);
    expect(shouldReplaceCanonical({ publishedAt: null, regional: false }, { publishedAt: null, regional: false })).toBe(false);
  });
});
