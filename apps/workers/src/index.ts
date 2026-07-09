import "./env.js";
import { chromium, type Browser } from "playwright";
import { prisma } from "@rovrum/db";
import { createBoss, ensureQueues, INGEST_QUEUE } from "./boss.js";
import { runIngest } from "./ingest.js";
import { dispatchDue } from "./scheduler.js";

const DISPATCH_QUEUE = "dispatch";
// How often the dispatcher checks for due sources. Per-source cadence gates the
// actual work; this is just the tick granularity.
const DISPATCH_CRON = process.env.INGEST_DISPATCH_CRON ?? "*/5 * * * *";
const USER_AGENT =
  process.env.INGEST_USER_AGENT ??
  "Mozilla/5.0 (compatible; RovrumBot/1.0; +https://www.rovrum.town)";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL!;
  const boss = createBoss(connectionString);
  boss.on("error", (err) => console.error("[pg-boss]", err));

  // One long-lived browser shared across all Playwright ingests — launching
  // Chromium per fetch would be far too expensive. Launched lazily on first use
  // so RSS-only runs (and the boot sequence) never pay for it.
  let browser: Browser | undefined;
  const getBrowser = async (): Promise<Browser> => {
    if (!browser) {
      browser = await chromium.launch();
      console.log("[playwright] browser launched");
    }
    return browser;
  };

  await boss.start();
  await ensureQueues(boss);
  await boss.createQueue(DISPATCH_QUEUE);

  // Worker: process ingest jobs. batchSize bounds parallelism — politeness-bound,
  // not throughput-bound, since we don't want to hammer a source's server. Each
  // source's job is independent, so run the batch concurrently.
  await boss.work(INGEST_QUEUE, { batchSize: 4 }, async (jobs) => {
    await Promise.all(
      jobs.map(async (job) => {
        const { sourceId } = job.data as { sourceId: string };
        const result = await runIngest(
          { prisma, fetchDeps: { userAgent: USER_AGENT }, getBrowser },
          sourceId,
        );
        console.log(
          `[ingest] ${sourceId} ${result.status} found=${result.itemsFound} new=${result.itemsNew} dropped=${result.droppedIrrelevant}`,
        );
      }),
    );
  });

  // Dispatcher: a scheduled job that enqueues due sources on each tick.
  await boss.work(DISPATCH_QUEUE, async () => {
    const n = await dispatchDue(boss, prisma);
    if (n > 0) console.log(`[dispatch] enqueued ${n} source(s)`);
  });
  await boss.schedule(DISPATCH_QUEUE, DISPATCH_CRON);

  // Kick a dispatch immediately on boot so we don't wait for the first cron tick.
  await boss.send(DISPATCH_QUEUE, {});

  console.log(`Rovrum workers up. Dispatch cron: "${DISPATCH_CRON}".`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received — stopping gracefully…`);
    await boss.stop();
    if (browser) await browser.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
