import { describe, it, expect } from "vitest";
import { isRotherhamRelevant, isRotherhamLocality, ROTHERHAM_TOWNS } from "./relevance.js";

describe("isRotherhamRelevant", () => {
  it("matches on 'Rotherham' regardless of case", () => {
    expect(isRotherhamRelevant("ROTHERHAM council meets")).toBe(true);
    expect(isRotherhamRelevant("A day out in rotherham")).toBe(true);
  });

  it("matches on surrounding town and area names", () => {
    expect(isRotherhamRelevant("Roadworks in Maltby this week")).toBe(true);
    expect(isRotherhamRelevant("Wath-upon-Dearne gala returns")).toBe(true);
    expect(isRotherhamRelevant("New shop opens in Wickersley")).toBe(true);
  });

  it("matches on the football club and its nickname", () => {
    expect(isRotherhamRelevant("The Millers sign a striker")).toBe(true);
    expect(isRotherhamRelevant("RUFC draw at home")).toBe(true);
  });

  it("rejects clearly non-Rotherham text", () => {
    expect(isRotherhamRelevant("Sheffield United beat Leeds")).toBe(false);
    expect(isRotherhamRelevant("Barnsley market reopens")).toBe(false);
  });

  it("matches whole words only — not substrings inside other words", () => {
    // "Aston" is an area; "Astonishing" must not match on it.
    expect(isRotherhamRelevant("An astonishing performance")).toBe(false);
  });

  it("handles empty / whitespace input", () => {
    expect(isRotherhamRelevant("")).toBe(false);
    expect(isRotherhamRelevant("   ")).toBe(false);
  });
});

describe("isRotherhamLocality", () => {
  it("matches Rotherham-area town names regardless of case", () => {
    expect(isRotherhamLocality("Rotherham")).toBe(true);
    expect(isRotherhamLocality("brinsworth")).toBe(true);
    expect(isRotherhamLocality("Wath")).toBe(true);
  });

  it("rejects out-of-area localities", () => {
    expect(isRotherhamLocality("Sheffield")).toBe(false);
    expect(isRotherhamLocality("Meadowhall")).toBe(false);
    expect(isRotherhamLocality("Toronto")).toBe(false);
    expect(isRotherhamLocality("London")).toBe(false);
  });

  it("does NOT match the football-club keywords (not place names)", () => {
    // "Millers"/"RUFC" flag relevance but are not localities — a locality filter
    // must not let them through.
    expect(isRotherhamLocality("Millers")).toBe(false);
    expect(isRotherhamLocality("RUFC")).toBe(false);
  });

  it("matches whole words only", () => {
    expect(isRotherhamLocality("Astonbury Festival")).toBe(false);
  });

  it("handles empty / whitespace input", () => {
    expect(isRotherhamLocality("")).toBe(false);
    expect(isRotherhamLocality("   ")).toBe(false);
  });
});

describe("ROTHERHAM_TOWNS", () => {
  it("is the shared town vocabulary (lowercase, no club keywords)", () => {
    expect(ROTHERHAM_TOWNS).toContain("rotherham");
    expect(ROTHERHAM_TOWNS).not.toContain("millers");
    expect(ROTHERHAM_TOWNS).not.toContain("rufc");
    expect(ROTHERHAM_TOWNS.every((t) => t === t.toLowerCase())).toBe(true);
  });
});
