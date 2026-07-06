import { describe, it, expect } from "vitest";
import { isRotherhamRelevant } from "./relevance.js";

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
