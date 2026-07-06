import PgBoss from "pg-boss";

/** The ingest queue name. Jobs carry `{ sourceId }`. */
export const INGEST_QUEUE = "ingest";
/** Failed ingest jobs land here after retries are exhausted. */
export const DEAD_LETTER_QUEUE = "ingest-dead-letter";

/**
 * Create (not yet started) a pg-boss instance on the same Postgres as the app.
 * pg-boss manages its own `pgboss` schema, so it coexists with the app tables.
 */
export function createBoss(connectionString: string): PgBoss {
  return new PgBoss({ connectionString, application_name: "rovrum-workers" });
}

/** Idempotently create the ingest queue + its dead-letter queue. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(DEAD_LETTER_QUEUE);
  await boss.createQueue(INGEST_QUEUE, {
    name: INGEST_QUEUE,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 30,
    deadLetter: DEAD_LETTER_QUEUE,
  });
}
