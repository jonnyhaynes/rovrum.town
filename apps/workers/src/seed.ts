import { SEED_SOURCES, type SeedSource } from "@rovrum/sources";

/** The prisma surface seeding needs — just `source.upsert`. Lets tests stub it. */
interface SeedClient {
  source: {
    upsert(args: {
      where: { url: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

/**
 * Idempotently upsert the source registry, keyed on `url`. `create` and `update`
 * carry the same fields, so re-running converges to the seed definition without
 * duplicating rows. Returns the number of sources processed.
 *
 * Pure orchestration over an injected client — no env or DB import side effects,
 * so the unit test can drive it with a stub. The CLI wiring lives in seed-cli.ts.
 */
export async function seedSources(
  client: SeedClient,
  sources: SeedSource[] = SEED_SOURCES,
): Promise<number> {
  for (const s of sources) {
    const fields = {
      name: s.name,
      type: s.type,
      vertical: s.vertical,
      url: s.url,
      fetchCadence: s.fetchCadence,
      enabled: s.enabled,
      // Explicit null (not undefined) so the column is set, not left untouched.
      config: s.config ?? null,
    };
    await client.source.upsert({
      where: { url: s.url },
      create: fields,
      update: fields,
    });
  }
  return sources.length;
}

export type { SeedClient };
