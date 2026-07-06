/**
 * Non-CI smoke check: fetch a handful of the real seeded feeds and report how many
 * items each yields. Run on demand — never in CI (it hits the live network).
 *
 *   pnpm --filter @rovrum/sources verify:live
 */
import { RssAdapter } from "./rss.js";
import type { AdapterSource } from "./adapter.js";

const FEEDS: AdapterSource[] = [
  { id: "council-news", type: "RSS", url: "https://www.rotherham.gov.uk/rss/news" },
  { id: "advertiser-news", type: "RSS", url: "https://www.rotherhamadvertiser.co.uk/news/rss/" },
  { id: "reddit", type: "RSS", url: "https://www.reddit.com/r/rotherham/.rss" },
  {
    id: "reed-jobs",
    type: "RSS",
    url: "https://www.reed.co.uk/jobs/rss?keywords=&locationName=Rotherham",
  },
  {
    id: "bbc-sy",
    type: "RSS",
    url: "https://feeds.bbci.co.uk/news/england/south_yorkshire/rss.xml",
  },
];

async function main(): Promise<void> {
  const adapter = new RssAdapter();
  let failures = 0;
  for (const feed of FEEDS) {
    try {
      const items = await adapter.fetch(feed);
      const sample = items[0]?.title ?? "(none)";
      console.log(
        `✓ ${feed.id.padEnd(18)} ${String(items.length).padStart(3)} items — e.g. "${sample}"`,
      );
    } catch (err) {
      failures++;
      console.error(`✗ ${feed.id.padEnd(18)} ${(err as Error).message}`);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

void main();
