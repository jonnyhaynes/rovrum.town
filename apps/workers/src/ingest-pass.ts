// One-shot ingest orchestration, extracted from any DB/network so it's unit
// testable. The CLI (ingest-cli.ts) wires the real Prisma client, source lister
// and browser; here we only decide *what* to ingest and *how to summarise*.
import type { Source } from "@rovrum/db";
import type { IngestResult } from "./ingest.js";

export interface IngestPassDeps {
  /** Return the sources to ingest. `dueOnly` gates on per-source cadence. */
  listSources: (opts: { dueOnly: boolean }) => Promise<Source[]>;
  /** Ingest a single source by id. Never throws for a source-level failure. */
  ingest: (sourceId: string) => Promise<IngestResult>;
}

export interface IngestPassOptions {
  /** Ingest every enabled source, ignoring cadence (first fill / manual run). */
  all?: boolean;
}

export interface SourceOutcome {
  id: string;
  name: string;
  result: IngestResult;
}

export interface IngestPassSummary {
  sources: number;
  succeeded: number;
  failed: number;
  itemsFound: number;
  itemsNew: number;
  droppedIrrelevant: number;
  outcomes: SourceOutcome[];
  /** True only when there was work to do and every source failed. */
  allFailed: boolean;
}

/**
 * Run one ingest pass: select sources (due-only by default, or all with
 * `{ all: true }`), ingest each sequentially (politeness), and total the
 * results. Individual failures are tolerated — the caller treats `allFailed` as
 * the hard-error signal so a single flaky feed doesn't fail the whole run.
 */
export async function runIngestPass(
  deps: IngestPassDeps,
  options: IngestPassOptions = {},
): Promise<IngestPassSummary> {
  const sources = await deps.listSources({ dueOnly: !options.all });

  const outcomes: SourceOutcome[] = [];
  for (const source of sources) {
    const result = await deps.ingest(source.id);
    outcomes.push({ id: source.id, name: source.name, result });
  }

  const succeeded = outcomes.filter((o) => o.result.status === "SUCCESS").length;
  const failed = outcomes.length - succeeded;

  return {
    sources: outcomes.length,
    succeeded,
    failed,
    itemsFound: sum(outcomes, (r) => r.itemsFound),
    itemsNew: sum(outcomes, (r) => r.itemsNew),
    droppedIrrelevant: sum(outcomes, (r) => r.droppedIrrelevant),
    outcomes,
    allFailed: outcomes.length > 0 && succeeded === 0,
  };
}

function sum(outcomes: SourceOutcome[], pick: (r: IngestResult) => number): number {
  return outcomes.reduce((acc, o) => acc + pick(o.result), 0);
}
