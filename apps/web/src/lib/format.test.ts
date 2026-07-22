import { describe, it, expect } from "vitest";
import { relativeTime, longDate } from "./format.js";

const now = new Date("2026-07-10T12:00:00Z");

describe("relativeTime", () => {
  it("says 'just now' for very recent times", () => {
    expect(relativeTime(new Date("2026-07-10T11:59:40Z"), now)).toBe("just now");
  });

  it("reports minutes", () => {
    expect(relativeTime(new Date("2026-07-10T11:30:00Z"), now)).toBe("30m ago");
  });

  it("reports hours", () => {
    expect(relativeTime(new Date("2026-07-10T09:00:00Z"), now)).toBe("3h ago");
  });

  it("reports days up to a week", () => {
    expect(relativeTime(new Date("2026-07-07T12:00:00Z"), now)).toBe("3d ago");
  });

  it("falls back to an absolute date beyond a week", () => {
    const out = relativeTime(new Date("2026-06-01T12:00:00Z"), now);
    expect(out).toMatch(/2026/);
    expect(out).not.toMatch(/ago/);
  });
});

describe("longDate", () => {
  it("formats a full masthead-style date", () => {
    // 22 July 2026 is a Wednesday.
    expect(longDate(new Date("2026-07-22T09:00:00Z"))).toBe("Wednesday, 22 July 2026");
  });
});
