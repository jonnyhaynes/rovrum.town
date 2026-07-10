/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// getViteConfig wires Astro's Vite plugin into Vitest so we can render .astro
// components via the Container API. Astro 6+ requires the `node` environment for
// component rendering (no client/jsdom rendering).
export default getViteConfig({
  test: {
    environment: "node",
  },
});
