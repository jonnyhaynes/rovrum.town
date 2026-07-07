import { describe, it, expect, vi } from "vitest";
import { seedSources } from "./seed.js";
import type { SeedSource } from "@rovrum/sources";

const sample: SeedSource[] = [
  {
    name: "Feed A",
    type: "RSS",
    url: "https://a.example.com/rss",
    vertical: "NEWS",
    fetchCadence: 30,
    enabled: true,
    config: { regional: true },
  },
  {
    name: "Feed B",
    type: "HTML",
    url: "https://b.example.com/jobs",
    vertical: "JOBS",
    fetchCadence: 180,
    enabled: false,
  },
];

/** A minimal prisma stub capturing upsert calls. */
function stubPrisma() {
  const upsert = vi.fn().mockResolvedValue({});
  return { prisma: { source: { upsert } }, upsert };
}

describe("seedSources", () => {
  it("upserts one row per source, keyed on url", async () => {
    const { prisma, upsert } = stubPrisma();
    const count = await seedSources(prisma as never, sample);

    expect(count).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);

    const firstArg = upsert.mock.calls[0]![0];
    expect(firstArg.where).toEqual({ url: "https://a.example.com/rss" });
    // create and update both carry the source fields (upsert = idempotent).
    expect(firstArg.create).toMatchObject({
      name: "Feed A",
      type: "RSS",
      vertical: "NEWS",
      url: "https://a.example.com/rss",
      fetchCadence: 30,
      enabled: true,
    });
    expect(firstArg.update).toMatchObject({ name: "Feed A", enabled: true });
  });

  it("passes config through as-is (regional flag / selectors preserved)", async () => {
    const { prisma, upsert } = stubPrisma();
    await seedSources(prisma as never, sample);
    expect(upsert.mock.calls[0]![0].create.config).toEqual({ regional: true });
    // A source without config seeds an explicit null (not undefined) for the column.
    expect(upsert.mock.calls[1]![0].create.config).toBeNull();
  });

  it("is idempotent by construction — update mirrors create (re-run changes nothing)", async () => {
    const { prisma, upsert } = stubPrisma();
    await seedSources(prisma as never, sample);
    const { create, update } = upsert.mock.calls[0]![0];
    // Everything create sets, update also sets — a second run converges.
    expect(update).toEqual(create);
  });
});
