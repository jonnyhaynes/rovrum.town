import { describe, it, expect } from "vitest";

// The scaffold's load-bearing contract (docs/plans/phase-2-web-mvp.md §2):
// the app must build as a static site (no live DB from the edge), and the
// public root `/` must stay the holding page until go-live — the feed lives
// under /news. These assertions fail if someone flips the app to SSR without a
// deliberate plan change.
import config from "../astro.config.mjs";

describe("astro.config", () => {
  it("does not claim a base subpath (holding page owns /, feed lives under /news)", () => {
    expect(config.base ?? "/").toBe("/");
  });

  it("builds as a static site (SSG)", () => {
    // `output: 'static'` is Astro's default; assert it explicitly so a flip to
    // 'server' is a visible, tested decision.
    expect(config.output ?? "static").toBe("static");
  });

  it("sets the canonical site origin", () => {
    expect(config.site).toBe("https://www.rovrum.town");
  });
});
