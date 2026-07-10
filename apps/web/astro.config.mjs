// @ts-check
import { defineConfig } from "astro/config";

// SSG (Astro's default `output: 'static'`): pages query the DB at build time and
// emit static HTML — no live DB connection from the web host.
//
// Until go-live, the public root `/` must show the holding/maintenance page, so
// it lives in `public/index.html` (copied verbatim to `dist/index.html`). The
// News feed builds under `/news` (`/news`, `/news/2`, …) — reviewable on preview
// deploys but not linked from `/`. Flipping `/` to the feed at launch is a
// deliberate manual step (see docs/plans/phase-2-web-mvp.md §2).
// Build output stays in the default `dist/` (matches turbo.json `outputs`).
export default defineConfig({
  site: "https://www.rovrum.town",
  output: "static",
});
