import { describe, it, expect } from "vitest";
import { SEED_SOURCES } from "./seed-data.js";

describe("SEED_SOURCES", () => {
  it("has the expected shape: 22 sources, all enabled", () => {
    expect(SEED_SOURCES).toHaveLength(22);
    expect(SEED_SOURCES.filter((s) => s.enabled)).toHaveLength(22);
    expect(SEED_SOURCES.filter((s) => !s.enabled)).toHaveLength(0);
  });

  it("has unique URLs (upsert key must not collide)", () => {
    const urls = SEED_SOURCES.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("marks exactly the three regional feeds", () => {
    // Eventbrite is scoped by structured locality (config.localityAllow), NOT the
    // keyword `regional` filter — that would drop generically-titled local events.
    const regional = SEED_SOURCES.filter((s) => s.config?.regional).map((s) => s.name);
    expect(regional).toEqual(["The Star — News", "The Star — Sport", "BBC News — South Yorkshire"]);
  });

  it("gives every enabled HTML source a workable extraction strategy", () => {
    for (const s of SEED_SOURCES.filter((s) => s.type === "HTML" && s.enabled)) {
      if (s.config?.strategy === "jsonLd") {
        // JSON-LD sources need no CSS selectors; a locality filter is expected here.
        expect(s.config?.localityAllow?.length, s.name).toBeGreaterThan(0);
      } else {
        expect(s.config?.selectors?.item, s.name).toBeTruthy();
        expect(s.config?.selectors?.title, s.name).toBeTruthy();
        expect(s.config?.selectors?.link, s.name).toBeTruthy();
      }
    }
  });

  it("gives every PLAYWRIGHT source a waitFor + item/title/link selectors", () => {
    for (const s of SEED_SOURCES.filter((s) => s.type === "PLAYWRIGHT")) {
      expect(s.config?.playwright?.waitFor, s.name).toBeTruthy();
      expect(s.config?.selectors?.item, s.name).toBeTruthy();
      expect(s.config?.selectors?.title, s.name).toBeTruthy();
      expect(s.config?.selectors?.link, s.name).toBeTruthy();
    }
  });

  it("marks the two JS-rendered sources as PLAYWRIGHT", () => {
    const pw = SEED_SOURCES.filter((s) => s.type === "PLAYWRIGHT").map((s) => s.name);
    expect(pw.sort()).toEqual([
      "Rotherham MBC — Jobs",
      "Rotherham United (Millers) — official",
    ]);
  });

  it("only the linkless iTrent portal uses linkFallbackToSource", () => {
    const fallback = SEED_SOURCES.filter((s) => s.config?.playwright?.linkFallbackToSource).map(
      (s) => s.name,
    );
    expect(fallback).toEqual(["Rotherham MBC — Jobs"]);
  });

  it("enabled non-RSS sources: Eventbrite (jsonLd) + NHS (Cheerio) + 2 Playwright", () => {
    const nonRss = SEED_SOURCES.filter((s) => s.enabled && s.type !== "RSS");
    expect(nonRss.map((s) => s.name).sort()).toEqual([
      "Eventbrite — Rotherham",
      "NHS Jobs — Rotherham",
      "Rotherham MBC — Jobs",
      "Rotherham United (Millers) — official",
    ]);
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
