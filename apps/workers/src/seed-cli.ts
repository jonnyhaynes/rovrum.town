// CLI entry for `pnpm --filter @rovrum/workers seed`. Loads env, connects the real
// Prisma client, and runs the idempotent seed.
import "./env.js";
import { prisma } from "@rovrum/db";
import { SEED_SOURCES } from "@rovrum/sources";
import { seedSources, type SeedClient } from "./seed.js";

async function main(): Promise<void> {
  const count = await seedSources(prisma as unknown as SeedClient);
  const enabled = SEED_SOURCES.filter((s) => s.enabled).length;
  console.log(`Seeded ${count} sources (${enabled} enabled, ${count - enabled} disabled).`);
  await prisma.$disconnect();
}

void main();
