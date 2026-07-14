// CLI entry for `pnpm --filter @rovrum/workers ingest:once`. Runs a single
// ingest pass over due sources (or all with `--all`) against the configured
// DATABASE_URL and exits — no pg-boss, no long-running process. This is what the
// scheduled GitHub Actions workflow invokes against Neon.
//
// Flags:
//   --all          ingest every enabled source, ignoring cadence (first fill)
//   --no-browser   skip PLAYWRIGHT sources (RSS/HTML only; no Chromium needed)
import "./env.js";
import { chromium, type Browser } from "playwright";
import { prisma } from "@rovrum/db";
import { runIngest } from "./ingest.js";
import { findDueSources } from "./scheduler.js";
import { runIngestPass } from "./ingest-pass.js";

const USER_AGENT =
  process.env.INGEST_USER_AGENT ??
  "Mozilla/5.0 (compatible; RovrumBot/1.0; +https://www.rovrum.town)";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const all = args.has("--all");
  const noBrowser = args.has("--no-browser");

  // Launch one shared Chromium lazily, only if a PLAYWRIGHT source actually
  // needs it — RSS/HTML-only passes never pay for it.
  let browser: Browser | undefined;
  const getBrowser = async (): Promise<Browser> => {
    if (!browser) {
      browser = await chromium.launch();
      console.log("[playwright] browser launched");
    }
    return browser;
  };

  const deps = {
    prisma,
    fetchDeps: { userAgent: USER_AGENT },
    ...(noBrowser ? {} : { getBrowser }),
  };

  const summary = await runIngestPass(
    {
      listSources: async ({ dueOnly }) => {
        const sources = dueOnly ? await findDueSources(prisma) : await allEnabled();
        return noBrowser ? sources.filter((s) => s.type !== "PLAYWRIGHT") : sources;
      },
      ingest: (sourceId) => runIngest(deps, sourceId),
    },
    { all },
  );

  for (const o of summary.outcomes) {
    console.log(
      `${o.result.status}\tnew=${o.result.itemsNew}\tfound=${o.result.itemsFound}\t${o.name}`,
    );
  }
  console.log(
    `Ingest pass: ${summary.sources} source(s), ${summary.succeeded} ok, ${summary.failed} failed, ${summary.itemsNew} new items.`,
  );

  await browser?.close();
  await prisma.$disconnect();

  // Hard-fail only when there was work and all of it failed — a single flaky
  // feed shouldn't fail the scheduled run (and skip the rebuild).
  if (summary.allFailed) {
    console.error("All sources failed — exiting non-zero.");
    process.exit(1);
  }
}

async function allEnabled() {
  return prisma.source.findMany({ where: { enabled: true } });
}

void main();
