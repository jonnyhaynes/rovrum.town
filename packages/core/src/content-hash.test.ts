import { describe, it, expect } from "vitest";
import { contentHash, canonicalizeUrl } from "./content-hash.js";

describe("canonicalizeUrl", () => {
  it("lowercases the host but preserves the path case", () => {
    expect(canonicalizeUrl("https://Example.COM/News/Story")).toBe(
      "https://example.com/News/Story",
    );
  });

  it("strips tracking params (utm_*, fbclid, gclid) but keeps meaningful ones", () => {
    expect(canonicalizeUrl("https://example.com/a?utm_source=x&id=42&fbclid=abc&gclid=z")).toBe(
      "https://example.com/a?id=42",
    );
  });

  it("strips the fragment", () => {
    expect(canonicalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("drops a trailing slash on the path", () => {
    expect(canonicalizeUrl("https://example.com/a/")).toBe("https://example.com/a");
  });

  it("returns the input unchanged when it is not a valid URL", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
});

describe("contentHash", () => {
  const base = { title: "Council approves new park", link: "https://example.com/news/park" };

  it("is stable across calls for the same input", () => {
    expect(contentHash(base)).toBe(contentHash(base));
  });

  it("is identical for URLs differing only by tracking params, fragment, or host case", () => {
    const dirty = {
      title: base.title,
      link: "https://EXAMPLE.com/news/park?utm_source=twitter#top",
    };
    expect(contentHash(dirty)).toBe(contentHash(base));
  });

  it("differs when the real URL differs", () => {
    const other = { title: base.title, link: "https://example.com/news/other" };
    expect(contentHash(other)).not.toBe(contentHash(base));
  });

  it("differs when the title differs", () => {
    const other = { title: "A different headline", link: base.link };
    expect(contentHash(other)).not.toBe(contentHash(base));
  });

  it("produces a hex SHA-256 digest", () => {
    expect(contentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});
