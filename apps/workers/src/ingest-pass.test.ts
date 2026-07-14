import { describe, it, expect, vi } from "vitest";
import type { Source } from "@rovrum/db";
import { runIngestPass, type IngestPassDeps } from "./ingest-pass.js";
import type { IngestResult } from "./ingest.js";

// Minimal Source stubs — only the fields selection/summary logic reads.
function src(id: string, over: Partial<Source> = {}): Source {
  return {
    id,
    name: id,
    type: "RSS",
    vertical: "NEWS",
    url: `https://example.com/${id}`,
    config: null,
    fetchCadence: 60,
    enabled: true,
    lastFetchedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  } as Source;
}

const ok = (over: Partial<IngestResult> = {}): IngestResult => ({
  itemsFound: 3,
  itemsNew: 2,
  droppedIrrelevant: 0,
  status: "SUCCESS",
  ...over,
});
const failed = (): IngestResult => ({
  itemsFound: 0,
  itemsNew: 0,
  droppedIrrelevant: 0,
  status: "FAILED",
});

/** Build deps with an injected source list + ingest fn (no DB, no network). */
function deps(sources: Source[], ingest: IngestPassDeps["ingest"]): IngestPassDeps {
  return {
    listSources: vi.fn(async () => sources),
    ingest,
  };
}

describe("runIngestPass", () => {
  it("ingests each selected source and totals the results", async () => {
    const ingest = vi.fn(async () => ok());
    const d = deps([src("a"), src("b")], ingest);

    const summary = await runIngestPass(d, { all: true });

    expect(ingest).toHaveBeenCalledTimes(2);
    expect(summary.sources).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.itemsNew).toBe(4);
  });

  it("with { all: true } asks for every enabled source (no cadence filter)", async () => {
    const listSources = vi.fn(async () => [src("a")]);
    await runIngestPass({ listSources, ingest: vi.fn(async () => ok()) }, { all: true });
    // Signalled via the `dueOnly` flag passed to the lister.
    expect(listSources).toHaveBeenCalledWith({ dueOnly: false });
  });

  it("without { all } asks for due sources only", async () => {
    const listSources = vi.fn(async () => [src("a")]);
    await runIngestPass({ listSources, ingest: vi.fn(async () => ok()) }, {});
    expect(listSources).toHaveBeenCalledWith({ dueOnly: true });
  });

  it("tolerates individual source failures (partial success)", async () => {
    const ingest = vi
      .fn<IngestPassDeps["ingest"]>()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(failed());
    const summary = await runIngestPass(deps([src("a"), src("b")], ingest), { all: true });

    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.allFailed).toBe(false);
  });

  it("flags allFailed only when every source fails", async () => {
    const ingest = vi.fn(async () => failed());
    const summary = await runIngestPass(deps([src("a"), src("b")], ingest), { all: true });
    expect(summary.allFailed).toBe(true);
  });

  it("is a no-op (not a failure) when there are no due sources", async () => {
    const ingest = vi.fn(async () => ok());
    const summary = await runIngestPass(deps([], ingest), {});
    expect(ingest).not.toHaveBeenCalled();
    expect(summary.sources).toBe(0);
    expect(summary.allFailed).toBe(false); // nothing to fail
  });
});
