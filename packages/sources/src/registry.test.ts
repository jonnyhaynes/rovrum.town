import { describe, it, expect } from "vitest";
import { getAdapter } from "./registry.js";
import { RssAdapter } from "./rss.js";
import { HtmlAdapter } from "./html.js";

describe("getAdapter", () => {
  it("returns the RSS adapter for type RSS", () => {
    expect(getAdapter("RSS")).toBeInstanceOf(RssAdapter);
  });

  it("returns the HTML adapter for type HTML", () => {
    expect(getAdapter("HTML")).toBeInstanceOf(HtmlAdapter);
  });

  it("throws for an unsupported type (API not implemented this phase)", () => {
    expect(() => getAdapter("API")).toThrow(/unsupported|not.*support/i);
  });
});
