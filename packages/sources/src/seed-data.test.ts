import { describe, it, expect } from "vitest";
import { SEED_SOURCES } from "./seed-data.js";

describe("SEED_SOURCES", () => {
  it("has the expected shape: 22 sources, 20 enabled, 2 disabled", () => {
    expect(SEED_SOURCES).toHaveLength(22);
    expect(SEED_SOURCES.filter((s) => s.enabled)).toHaveLength(20);
    expect(SEED_SOURCES.filter((s) => !s.enabled)).toHaveLength(2);
  });

  it("has unique URLs (upsert key must not collide)", () => {
    const urls = SEED_SOURCES.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("marks exactly the three regional feeds", () => {
    const regional = SEED_SOURCES.filter((s) => s.config?.regional).map((s) => s.name);
    expect(regional).toEqual(["The Star — News", "The Star — Sport", "BBC News — South Yorkshire"]);
  });

  it("gives every HTML source item/title/link selectors (else it can't scrape)", () => {
    for (const s of SEED_SOURCES.filter((s) => s.type === "HTML" && s.enabled)) {
      expect(s.config?.selectors, s.name).toBeDefined();
      expect(s.config?.selectors?.item, s.name).toBeTruthy();
      expect(s.config?.selectors?.title, s.name).toBeTruthy();
      expect(s.config?.selectors?.link, s.name).toBeTruthy();
    }
  });

  it("disables exactly the Playwright-only sources", () => {
    const disabled = SEED_SOURCES.filter((s) => !s.enabled).map((s) => s.name);
    expect(disabled).toEqual(["Rotherham United (Millers) — official", "NHS Jobs — Rotherham"]);
  });

  it("covers all four verticals", () => {
    const verticals = new Set(SEED_SOURCES.map((s) => s.vertical));
    expect(verticals).toEqual(new Set(["NEWS", "SPORTS", "EVENTS", "JOBS"]));
  });

  it("uses only valid https URLs", () => {
    for (const s of SEED_SOURCES) {
      expect(() => new URL(s.url), s.name).not.toThrow();
      expect(s.url.startsWith("https://"), s.name).toBe(true);
    }
  });
});
