import type PgBoss from "pg-boss";
import type { PrismaClient, Source } from "@rovrum/db";
import { INGEST_QUEUE } from "./boss.js";

/**
 * Enabled sources whose last fetch is older than their cadence (or never fetched).
 * Cadence lives in the row (minutes), so tuning a source is a DB edit, not a deploy.
 */
export async function findDueSources(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<Source[]> {
  const enabled = await prisma.source.findMany({ where: { enabled: true } });
  return enabled.filter((s) => isDue(s, now));
}

/** True if the source has never been fetched or is past its cadence window. */
export function isDue(source: Pick<Source, "lastFetchedAt" | "fetchCadence">, now: Date): boolean {
  if (!source.lastFetchedAt) return true;
  const dueAt = source.lastFetchedAt.getTime() + source.fetchCadence * 60_000;
  return now.getTime() >= dueAt;
}

/**
 * Enqueue an ingest job per due source. `singletonKey: sourceId` means a source
 * can't be double-queued while a job for it is still pending — the scheduler can
 * tick faster than jobs drain without piling up duplicates. Returns how many were
 * enqueued.
 */
export async function dispatchDue(boss: PgBoss, prisma: PrismaClient): Promise<number> {
  const due = await findDueSources(prisma);
  let enqueued = 0;
  for (const source of due) {
    const id = await boss.send(INGEST_QUEUE, { sourceId: source.id }, { singletonKey: source.id });
    // send() returns null if a singleton job already exists — don't count those.
    if (id) enqueued++;
  }
  return enqueued;
}
