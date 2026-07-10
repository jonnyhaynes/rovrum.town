// @ts-check
import { defineConfig } from "astro/config";

// SSG (Astro's default `output: 'static'`): pages query the DB at build time and
// emit static HTML — no live DB connection from the web host. See
// docs/plans/phase-2-web-mvp.md §2. The app owns the site root (`/`); the old
// holding page now lives at `/soon` (copied verbatim from `public/soon/`).
// Build output stays in the default `dist/` (matches turbo.json `outputs`).
export default defineConfig({
  site: "https://www.rovrum.town",
  output: "static",
});
