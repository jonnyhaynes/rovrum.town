import { describe, it, expect } from "vitest";
import { isDue } from "./scheduler.js";

const NOW = new Date("2026-07-06T12:00:00Z");

describe("isDue", () => {
  it("is due when never fetched", () => {
    expect(isDue({ lastFetchedAt: null, fetchCadence: 30 }, NOW)).toBe(true);
  });

  it("is due when the cadence window has elapsed", () => {
    const lastFetchedAt = new Date("2026-07-06T11:29:00Z"); // 31 min ago
    expect(isDue({ lastFetchedAt, fetchCadence: 30 }, NOW)).toBe(true);
  });

  it("is not due within the cadence window", () => {
    const lastFetchedAt = new Date("2026-07-06T11:45:00Z"); // 15 min ago
    expect(isDue({ lastFetchedAt, fetchCadence: 30 }, NOW)).toBe(false);
  });

  it("is due exactly at the cadence boundary", () => {
    const lastFetchedAt = new Date("2026-07-06T11:30:00Z"); // exactly 30 min ago
    expect(isDue({ lastFetchedAt, fetchCadence: 30 }, NOW)).toBe(true);
  });
});
